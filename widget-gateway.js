/**
 * Widget Gateway Script v1.3
 *
 * This is the ONLY script clients need to install.
 * It handles:
 * - Account status checking (active/suspended/canceled)
 * - Enabled widgets filtering
 * - Dynamic widget loading
 * - Silent blocking (NO customer-facing messages ever)
 *
 * Changelog v1.3:
 * - REMOVED: Suspension/cancellation popup (was showing on client websites)
 * - IMPROVED: All account issues now handled silently - widgets just don't load
 * - NO customer-facing messages for ANY account status issues
 *
 * Changelog v1.2:
 * - REMOVED: Trial expiration popup (was showing on client websites)
 * - FIXED: Complimentary accounts now never blocked (respects is_complimentary field)
 * - FIXED: Unlimited accounts now never blocked
 * - IMPROVED: Trial expiration handling is now silent (no customer-facing messages)
 *
 * Usage (Recommended - works with GTM):
 * <script src="https://cdn.jsdelivr.net/gh/crave-media-io/conversion-widgets@main/widget-gateway.js?client-id=YOUR_CLIENT_ID"></script>
 *
 * Legacy Usage (still supported):
 * <script src="https://cdn.jsdelivr.net/gh/crave-media-io/conversion-widgets@main/widget-gateway.js"
 *         data-client-id="YOUR_CLIENT_ID"></script>
 */

(function() {
    'use strict';

    // Configuration
    const SUPABASE_URL = 'https://dnsbirpaknvifkgbodqd.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuc2JpcnBha252aWZrZ2JvZHFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDI1MjUsImV4cCI6MjA3NTQ3ODUyNX0.0f_q15ZhmHI2gEpS53DyIeRnReF-KS4YYJ1PdetyYwQ';

    const WIDGET_SCRIPTS = {
        sidebar: 'https://cdn.jsdelivr.net/gh/crave-media-io/conversion-widgets@main/sidebar-widget.js',
        smart_button: 'https://cdn.jsdelivr.net/gh/crave-media-io/conversion-widgets@main/smart-button-widget.js',
        after_hours: 'https://cdn.jsdelivr.net/gh/crave-media-io/conversion-widgets@main/afterHours-widget.js'
    };

    /**
     * Get client ID with multiple fallback methods for maximum compatibility
     * Priority: URL parameter > data attribute > global variable
     */
    function getClientId() {
        // Method 1: URL parameter (recommended - works everywhere including GTM)
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].src;
            if (src && src.includes('widget-gateway.js')) {
                const url = new URL(src);
                const clientId = url.searchParams.get('client-id');
                if (clientId) {
                    console.log('[Widget Gateway] Client ID found in URL parameter');
                    return clientId;
                }
            }
        }

        // Method 2: data-client-id attribute (legacy support)
        const scriptTag = document.currentScript || document.querySelector('script[data-client-id]');
        if (scriptTag) {
            const clientId = scriptTag.getAttribute('data-client-id');
            if (clientId) {
                console.log('[Widget Gateway] Client ID found in data attribute (legacy method)');
                return clientId;
            }
        }

        // Method 3: Global variable (GTM workaround - kept for backwards compatibility)
        if (window.CONVERSION_WIDGET_CLIENT_ID) {
            console.log('[Widget Gateway] Client ID found in global variable');
            return window.CONVERSION_WIDGET_CLIENT_ID;
        }

        return null;
    }

    const clientId = getClientId();

    if (!clientId) {
        console.error('[Widget Gateway] Error: No client ID provided. Add ?client-id=YOUR_ID to the script URL.');
        return;
    }

    console.log('[Widget Gateway] Initializing for client:', clientId);

    /**
     * Fetch client configuration from Supabase
     */
    async function fetchClientConfig() {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/widget_clients?client_id=eq.${clientId}`, {
                method: 'GET',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (!data || data.length === 0) {
                throw new Error('Client not found');
            }

            return data[0];
        } catch (error) {
            console.error('[Widget Gateway] Error fetching client config:', error);
            return null;
        }
    }



    /**
     * Load a widget script dynamically
     */
    function loadWidget(widgetId, clientId) {
        return new Promise((resolve, reject) => {
            const scriptUrl = WIDGET_SCRIPTS[widgetId];

            if (!scriptUrl) {
                console.error(`[Widget Gateway] Unknown widget ID: ${widgetId}`);
                reject(new Error(`Unknown widget: ${widgetId}`));
                return;
            }

            const script = document.createElement('script');
            script.src = scriptUrl;
            script.setAttribute('data-client-id', clientId);
            script.async = true;

            script.onload = () => {
                console.log(`[Widget Gateway] ✓ Loaded widget: ${widgetId}`);
                resolve();
            };

            script.onerror = () => {
                console.error(`[Widget Gateway] ✗ Failed to load widget: ${widgetId}`);
                reject(new Error(`Failed to load ${widgetId}`));
            };

            document.head.appendChild(script);
        });
    }

    /**
     * Main initialization function
     */
    async function initialize() {
        console.log('[Widget Gateway] Fetching client configuration...');

        const client = await fetchClientConfig();

        if (!client) {
            console.error('[Widget Gateway] Failed to load client configuration. Widgets will not load.');
            return;
        }

        // Check site status
        const status = client.status || 'active';
        console.log('[Widget Gateway] Site status:', status);

        if (status === 'suspended' || status === 'canceled') {
            console.warn('[Widget Gateway] Site is suspended or canceled. Blocking widgets silently.');
            return; // Don't load any widgets - NO popup or warning shown
        }

        // Check subscription and trial status
        const subscriptionStatus = client.subscription_status || 'trial';
        const subscriptionPlan = client.subscription_plan || 'starter';
        const isComplimentary = client.is_complimentary || false;
        const trialEndsAt = client.trial_ends_at ? new Date(client.trial_ends_at) : null;
        const now = new Date();

        console.log('[Widget Gateway] Subscription status:', subscriptionStatus);
        console.log('[Widget Gateway] Subscription plan:', subscriptionPlan);
        console.log('[Widget Gateway] Is complimentary:', isComplimentary);
        console.log('[Widget Gateway] Trial ends at:', trialEndsAt);

        // Determine if widgets should be blocked
        // NEVER block complimentary accounts or unlimited plans
        const isUnlimited = (subscriptionPlan === 'unlimited');
        const isComplimentaryStatus = (subscriptionStatus === 'complimentary');

        // Only block if:
        // 1. Subscription explicitly expired (payment failed and account suspended by cron job)
        // 2. Trial expired AND account is NOT complimentary AND NOT unlimited
        const shouldBlock = (
            subscriptionStatus === 'expired' &&
            !isComplimentary &&
            !isUnlimited &&
            !isComplimentaryStatus
        ) || (
            subscriptionStatus === 'trial' &&
            trialEndsAt &&
            trialEndsAt < now &&
            !isComplimentary &&
            !isUnlimited &&
            !isComplimentaryStatus
        );

        if (shouldBlock) {
            console.warn('[Widget Gateway] Trial/subscription expired. Blocking widgets silently.');
            return; // Don't load any widgets - NO popup or warning shown
        }

        // Log if account is complimentary or unlimited (for debugging)
        if (isComplimentary || isUnlimited || isComplimentaryStatus) {
            console.log('[Widget Gateway] Account is complimentary or unlimited - widgets will always load');
        }

        // Get enabled widgets
        let enabledWidgets = client.enabled_widgets || [];

        // Handle string format (if stored as JSON string)
        if (typeof enabledWidgets === 'string') {
            try {
                enabledWidgets = JSON.parse(enabledWidgets);
            } catch (e) {
                console.error('[Widget Gateway] Error parsing enabled_widgets:', e);
                enabledWidgets = [];
            }
        }

        // Ensure it's an array
        if (!Array.isArray(enabledWidgets)) {
            console.error('[Widget Gateway] enabled_widgets is not an array:', enabledWidgets);
            enabledWidgets = [];
        }

        console.log('[Widget Gateway] Enabled widgets:', enabledWidgets);

        // If no widgets are enabled, exit
        if (enabledWidgets.length === 0) {
            console.log('[Widget Gateway] No widgets enabled for this site.');
            return;
        }

        // Load each enabled widget
        console.log('[Widget Gateway] Loading enabled widgets...');

        const loadPromises = enabledWidgets.map(widgetId => {
            return loadWidget(widgetId, clientId).catch(error => {
                console.error(`[Widget Gateway] Failed to load ${widgetId}:`, error);
                // Continue loading other widgets even if one fails
            });
        });

        await Promise.all(loadPromises);

        console.log('[Widget Gateway] Initialization complete!');
    }

    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
