/**
 * Widget Gateway Script v1.1
 *
 * This is the ONLY script clients need to install.
 * It handles:
 * - Account status checking (active/suspended)
 * - Enabled widgets filtering
 * - Dynamic widget loading
 * - Suspension warnings
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
     * Show suspension warning overlay
     */
    function showSuspensionWarning() {
        // Check if warning already exists
        if (document.getElementById('widget-suspension-warning')) {
            return;
        }

        const warning = document.createElement('div');
        warning.id = 'widget-suspension-warning';
        warning.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
            color: white;
            padding: 20px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(220, 53, 69, 0.4);
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 400px;
            animation: slideIn 0.3s ease-out;
        `;

        warning.innerHTML = `
            <style>
                @keyframes slideIn {
                    from {
                        transform: translateX(500px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                #widget-suspension-warning strong {
                    display: block;
                    font-size: 18px;
                    margin-bottom: 8px;
                    font-weight: 600;
                }
                #widget-suspension-warning p {
                    margin: 0;
                    font-size: 14px;
                    line-height: 1.5;
                    opacity: 0.95;
                }
                #widget-suspension-close {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                    line-height: 1;
                    transition: background 0.2s;
                }
                #widget-suspension-close:hover {
                    background: rgba(255,255,255,0.3);
                }
            </style>
            <button id="widget-suspension-close" onclick="this.parentElement.remove()">×</button>
            <strong>⚠️ Service Suspended</strong>
            <p>This website's conversion widgets are temporarily unavailable. Please contact the site owner for assistance.</p>
        `;

        document.body.appendChild(warning);
        console.log('[Widget Gateway] Suspension warning displayed');
    }

    /**
     * Show trial expired warning overlay
     */
    function showTrialExpiredWarning() {
        // Check if warning already exists
        if (document.getElementById('widget-trial-expired-warning')) {
            return;
        }

        const warning = document.createElement('div');
        warning.id = 'widget-trial-expired-warning';
        warning.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);
            color: #333;
            padding: 20px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(255, 193, 7, 0.4);
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            max-width: 400px;
            animation: slideInTrial 0.3s ease-out;
        `;

        warning.innerHTML = `
            <style>
                @keyframes slideInTrial {
                    from {
                        transform: translateX(500px);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                #widget-trial-expired-warning strong {
                    display: block;
                    font-size: 18px;
                    margin-bottom: 8px;
                    font-weight: 600;
                }
                #widget-trial-expired-warning p {
                    margin: 0 0 12px 0;
                    font-size: 14px;
                    line-height: 1.5;
                }
                #widget-trial-close {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                    background: rgba(0,0,0,0.1);
                    border: none;
                    color: #333;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                    line-height: 1;
                    transition: background 0.2s;
                }
                #widget-trial-close:hover {
                    background: rgba(0,0,0,0.2);
                }
                .upgrade-btn {
                    display: inline-block;
                    padding: 10px 20px;
                    background: #333;
                    color: white;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: 600;
                    font-size: 14px;
                    transition: background 0.2s;
                }
                .upgrade-btn:hover {
                    background: #000;
                }
            </style>
            <button id="widget-trial-close" onclick="this.parentElement.remove()">×</button>
            <strong>⏰ Free Trial Expired</strong>
            <p>This website's conversion widgets are no longer active. The site owner needs to upgrade to continue using these features.</p>
            <a href="https://www.cravemedia.io/client-dashboard/" class="upgrade-btn" target="_blank">Upgrade Now</a>
        `;

        document.body.appendChild(warning);
        console.log('[Widget Gateway] Trial expired warning displayed');
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
            console.warn('[Widget Gateway] Site is suspended. Showing warning and blocking widgets.');
            showSuspensionWarning();
            return; // Don't load any widgets
        }

        // Check trial expiration
        const subscriptionStatus = client.subscription_status || 'trial';
        const trialEndsAt = client.trial_ends_at ? new Date(client.trial_ends_at) : null;
        const now = new Date();

        console.log('[Widget Gateway] Subscription status:', subscriptionStatus);
        console.log('[Widget Gateway] Trial ends at:', trialEndsAt);

        // Block widgets if trial expired or subscription explicitly expired
        if (subscriptionStatus === 'expired' || (subscriptionStatus === 'trial' && trialEndsAt && trialEndsAt < now)) {
            console.warn('[Widget Gateway] Trial/subscription expired. Showing expiration warning and blocking widgets.');
            showTrialExpiredWarning();
            return; // Don't load any widgets
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
