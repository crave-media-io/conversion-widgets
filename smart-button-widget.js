(function() {
  'use strict';

  // ============================================
  // CONFIGURATION
  // ============================================
  const SUPABASE = {
    url: 'https://dnsbirpaknvifkgbodqd.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuc2JpcnBha252aWZrZ2JvZHFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDI1MjUsImV4cCI6MjA3NTQ3ODUyNX0.0f_q15ZhmHI2gEpS53DyIeRnReF-KS4YYJ1PdetyYwQ'
  };

  // Get client ID from script tag
  const scriptTag = document.currentScript || document.querySelector('script[data-client-id][src*="smart-button"]');
  const CLIENT_ID = scriptTag ? scriptTag.getAttribute('data-client-id') : 'test_client_123';

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  const state = {
    config: null,
    currentVariant: null,
    currentIndex: 0,
    rotationTimer: null,
    headlines: null,
    canonicalPageUrl: null,
    sessionButtonText: null,     // Consistent button text for session
    sessionButtonColor: null,    // Consistent button color for session
    headlinesEnabled: true,      // Whether to show headlines
    targetDiv: null              // The div where the widget should be rendered
  };

  // ============================================
  // DOMAIN VALIDATION & WIDGET ENFORCEMENT
  // ============================================
  function checkDomainMatch(allowedDomain) {
    // If no domain specified, allow all (backward compatibility)
    if (!allowedDomain) {
      return true;
    }

    const currentDomain = window.location.hostname.toLowerCase();
    const cleanCurrent = currentDomain.replace(/^www\./, '');
    const cleanAllowed = allowedDomain.toLowerCase().replace(/^www\./, '');

    // Special case: allow localhost for development
    if (currentDomain === 'localhost' || currentDomain === '127.0.0.1') {
      console.log('ℹ️ Localhost detected - allowing for development');
      return true;
    }

    if (cleanCurrent !== cleanAllowed) {
      console.warn(`🚫 Widget blocked: Domain mismatch. Expected ${cleanAllowed}, got ${cleanCurrent}`);
      return false;
    }

    return true;
  }

  async function checkIfSiteActive(clientId) {
    try {
      const response = await fetch(
        `${SUPABASE.url}/rest/v1/widget_clients?client_id=eq.${clientId}&select=status`,
        {
          headers: {
            'apikey': SUPABASE.key,
            'Authorization': `Bearer ${SUPABASE.key}`
          }
        }
      );

      if (!response.ok) {
        console.warn('⚠️ Failed to check site status - allowing widget (fail open)');
        return true;
      }

      const data = await response.json();
      const status = data[0]?.status || 'active';

      if (status === 'suspended') {
        console.log('🚫 Site is suspended - upgrade your plan to reactivate');
        return false;
      }

      return true;

    } catch (error) {
      console.warn('⚠️ Error checking site status:', error);
      return true;
    }
  }

  async function checkIfWidgetEnabled(widgetName, clientId) {
    try {
      const response = await fetch(
        `${SUPABASE.url}/rest/v1/widget_clients?client_id=eq.${clientId}&select=enabled_widgets`,
        {
          headers: {
            'apikey': SUPABASE.key,
            'Authorization': `Bearer ${SUPABASE.key}`
          }
        }
      );

      if (!response.ok) {
        console.warn('⚠️ Failed to check widget status - allowing widget (fail open)');
        return true; // Fail open - allow widget if can't verify
      }

      const data = await response.json();
      const enabledWidgets = data[0]?.enabled_widgets || [];

      if (!enabledWidgets.includes(widgetName)) {
        console.log(`🚫 Widget "${widgetName}" not enabled for client ${clientId}`);
        return false;
      }

      return true;

    } catch (error) {
      console.warn('⚠️ Error checking widget status:', error);
      return true; // Fail open - allow widget if error occurs
    }
  }

  // ============================================
  // FETCH CONFIG FROM SUPABASE
  // ============================================
  async function fetchClientConfig() {
    try {
      console.log('🎯 Fetching Smart Button config for client:', CLIENT_ID);

      const response = await fetch(
        `${SUPABASE.url}/rest/v1/widget_clients?client_id=eq.${CLIENT_ID}`,
        {
          headers: {
            'apikey': SUPABASE.key,
            'Authorization': `Bearer ${SUPABASE.key}`
          }
        }
      );

      const data = await response.json();

      if (data && data.length > 0) {
        const config = data[0];
        console.log('✅ Smart Button config loaded:', config.business_name);
        return config;
      } else {
        console.error('❌ No config found for client:', CLIENT_ID);
        return null;
      }
    } catch (error) {
      console.error('❌ Error fetching config:', error);
      return null;
    }
  }

  // ============================================
  // SESSION-BASED BUTTON TEXT & COLOR SELECTION
  // ============================================
  function selectSessionButtonText(buttonTexts) {
    const sessionKey = `smart_button_text_${CLIENT_ID}`;
    const cached = sessionStorage.getItem(sessionKey);

    if (cached && buttonTexts.includes(cached)) {
      console.log('📦 Using cached button text:', cached);
      return cached;
    }

    // Random selection from available button texts
    const selected = buttonTexts[Math.floor(Math.random() * buttonTexts.length)];
    sessionStorage.setItem(sessionKey, selected);
    console.log('🎲 Selected button text for session:', selected);
    return selected;
  }

  function selectSessionButtonColor(buttonColors) {
    const sessionKey = `smart_button_color_${CLIENT_ID}`;
    const cached = sessionStorage.getItem(sessionKey);

    if (cached && buttonColors.includes(cached)) {
      console.log('📦 Using cached button color:', cached);
      return cached;
    }

    // Random selection from available button colors
    const selected = buttonColors[Math.floor(Math.random() * buttonColors.length)];
    sessionStorage.setItem(sessionKey, selected);
    console.log('🎨 Selected button color for session:', selected);
    return selected;
  }

  // ============================================
  // FETCH HEADLINES
  // ============================================
  async function getHeadlines(config) {
    const currentPath = window.location.pathname;
    const cacheKey = `smart_button_headlines_${CLIENT_ID}_${currentPath}`;
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      console.log('📦 Using cached headlines');
      const cachedData = JSON.parse(cached);
      state.canonicalPageUrl = cachedData.canonicalPageUrl || currentPath;
      return cachedData.headlines;
    }

    try {
      console.log('📋 Loading headlines for page:', currentPath);

      // First, try exact match
      let response = await fetch(
        `${SUPABASE.url}/rest/v1/page_headlines?client_id=eq.${CLIENT_ID}&page_url=eq.${encodeURIComponent(currentPath)}`,
        {
          headers: {
            'apikey': SUPABASE.key,
            'Authorization': `Bearer ${SUPABASE.key}`
          }
        }
      );

      let data = await response.json();

      // If no exact match, check additional_urls
      if (!data || data.length === 0) {
        console.log('🔍 No exact match, checking additional URLs...');

        // Fetch all pages for this client
        response = await fetch(
          `${SUPABASE.url}/rest/v1/page_headlines?client_id=eq.${CLIENT_ID}`,
          {
            headers: {
              'apikey': SUPABASE.key,
              'Authorization': `Bearer ${SUPABASE.key}`
            }
          }
        );

        const allPages = await response.json();

        // Check each page's additional_urls for a match
        for (let i = 0; i < allPages.length; i++) {
          const page = allPages[i];
          let additionalUrls = page.additional_urls || [];

          // Handle string parsing if needed
          if (typeof additionalUrls === 'string') {
            try {
              additionalUrls = JSON.parse(additionalUrls);
            } catch (e) {
              additionalUrls = [];
            }
          }

          if (!Array.isArray(additionalUrls)) additionalUrls = [];

          // Check for wildcard matches
          for (let j = 0; j < additionalUrls.length; j++) {
            const urlPattern = additionalUrls[j];
            let isMatch = false;

            if (urlPattern.includes('*')) {
              // Simple wildcard matching
              const pattern = urlPattern.replace(/\*/g, '.*');
              const regex = new RegExp('^' + pattern + '$');
              isMatch = regex.test(currentPath);
            } else {
              isMatch = currentPath === urlPattern;
            }

            if (isMatch) {
              console.log('✅ Found match via additional_urls:', page.page_url);
              state.canonicalPageUrl = page.page_url;
              const result = { headlines: page.headlines, canonicalPageUrl: page.page_url };
              sessionStorage.setItem(cacheKey, JSON.stringify(result));
              return page.headlines;
            }
          }
        }
      } else {
        // Exact match found
        console.log('✅ Page-specific headlines loaded:', data[0].headlines);
        state.canonicalPageUrl = data[0].page_url;
        const result = { headlines: data[0].headlines, canonicalPageUrl: data[0].page_url };
        sessionStorage.setItem(cacheKey, JSON.stringify(result));
        return data[0].headlines;
      }

      // No match found
      console.log('📝 No page-specific headlines, using defaults');
      state.canonicalPageUrl = currentPath;
      return config.headlines || getDefaultHeadlines();
    } catch (error) {
      console.error('❌ Error loading headlines:', error);
      state.canonicalPageUrl = currentPath;
      return config.headlines || getDefaultHeadlines();
    }
  }

  function getDefaultHeadlines() {
    return [
      "Need help? We're here for you!",
      "Get started today!",
      "Ready to take the next step?"
    ];
  }

  // ============================================
  // PERFORMANCE TRACKING
  // ============================================
  function getPerformanceData() {
    try {
      const data = localStorage.getItem('smartButtonPerformance_' + CLIENT_ID);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  function savePerformanceData(data) {
    try {
      localStorage.setItem('smartButtonPerformance_' + CLIENT_ID, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving performance:', e);
    }
  }

  async function sendToSupabase(eventType, variant) {
    // Use canonical page URL for metrics aggregation across matching pages
    const canonicalUrl = state.canonicalPageUrl || window.location.pathname;
    const actualUrl = window.location.pathname;

    try {
      await fetch(SUPABASE.url + '/rest/v1/headline_performance', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE.key,
          'Authorization': 'Bearer ' + SUPABASE.key,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          page_url: canonicalUrl,
          actual_url: actualUrl,
          headline: variant.headline,
          button_text: state.sessionButtonText,
          button_color: state.sessionButtonColor,
          event_type: eventType
        })
      });
    } catch (error) {
      console.error('Error sending to Supabase:', error);
    }
  }

  function trackImpression(variant) {
    const perfData = getPerformanceData();
    const key = variant.headline;

    if (!perfData[key]) {
      perfData[key] = {
        headline: variant.headline,
        style: variant.style,
        impressions: 0,
        conversions: 0,
        lastShown: null
      };
    }

    perfData[key].impressions++;
    perfData[key].lastShown = new Date().toISOString();

    savePerformanceData(perfData);
    console.log('📊 Smart Button impression:', key);

    sendToSupabase('impression', variant);
  }

  function trackConversion(variant) {
    const perfData = getPerformanceData();
    const key = variant.headline;

    if (perfData[key]) {
      perfData[key].conversions++;
      savePerformanceData(perfData);

      const rate = ((perfData[key].conversions / perfData[key].impressions) * 100).toFixed(1);
      console.log('🎯 SMART BUTTON CONVERSION!', {
        headline: key,
        buttonText: state.sessionButtonText,
        buttonColor: state.sessionButtonColor,
        conversions: perfData[key].conversions,
        impressions: perfData[key].impressions,
        rate: rate + '%'
      });

      sendToSupabase('conversion', variant);
    }
  }

  async function selectBestVariantAggregate(variants) {
    const epsilon = 0.2;

    if (Math.random() < epsilon) {
      const randomVariant = variants[Math.floor(Math.random() * variants.length)];
      console.log('🎲 Exploring (random):', randomVariant.headline);
      return randomVariant;
    }

    try {
      const response = await fetch(
        SUPABASE.url + '/rest/v1/headline_stats?client_id=eq.' + CLIENT_ID + '&page_url=eq.' + window.location.pathname,
        {
          headers: {
            'apikey': SUPABASE.key,
            'Authorization': 'Bearer ' + SUPABASE.key
          }
        }
      );

      const stats = await response.json();

      if (!stats || stats.length === 0) {
        console.log('📊 No stats yet, showing first headline');
        return variants[0];
      }

      let bestHeadline = null;
      let bestRate = 0;

      stats.forEach(stat => {
        if (stat.conversion_rate > bestRate) {
          bestRate = stat.conversion_rate;
          bestHeadline = stat.headline;
        }
      });

      if (!bestHeadline) {
        return variants[0];
      }

      const bestVariant = variants.find(v => v.headline === bestHeadline);

      if (bestVariant) {
        console.log('🏆 Global winner (' + bestRate + '%):', bestHeadline);
        return bestVariant;
      }

      return variants[0];

    } catch (error) {
      console.error('Error fetching aggregate stats:', error);
      return variants[0];
    }
  }

  // ============================================
  // CREATE SMART BUTTON HTML
  // ============================================
  function createSmartButtonHTML(variant, config) {
    // Determine button link with custom URL override
    let buttonLink;
    if (config.smart_button_use_custom_url && config.smart_button_custom_url && config.smart_button_custom_url.trim()) {
      // Use custom URL if enabled and provided
      let customUrl = config.smart_button_custom_url.trim();
      // Ensure URL has protocol to prevent relative path issues
      if (!customUrl.match(/^https?:\/\//i) && !customUrl.startsWith('tel:') && !customUrl.startsWith('mailto:')) {
        customUrl = 'https://' + customUrl;
      }
      buttonLink = customUrl;
      console.log('🔗 Using custom URL for smart button:', buttonLink);
    } else {
      // Fall back to default behavior
      buttonLink = config.button_type === 'call'
        ? `tel:${config.phone_number.replace(/\D/g, '')}`
        : config.booking_url;
    }

    const borderColor = config.banner_border_color || config.brand_color || '#667eea';
    const bgColor = config.banner_bg_color || '#ffffff';
    const buttonColor = state.sessionButtonColor;
    const buttonText = state.sessionButtonText;
    const buttonTextColor = config.smart_button_text_color || '#FFFFFF';
    const fontFamily = config.custom_font_family || 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    // Use show_branding from database config (set based on subscription plan)
    // Pro, Premium, and Unlimited plans have show_branding=false
    const showBranding = config.show_branding !== false;

    // Conditionally render headline section
    const headlineSection = state.headlinesEnabled ? `
      <h2 id="smart-button-headline" style="
        margin: 0 0 20px 0;
        font-size: 28px;
        font-weight: 700;
        line-height: 1.3;
        color: #333;
        font-family: inherit;
      ">
        ${variant.headline}
      </h2>
    ` : '';

    return `
      <div id="smart-button-widget" style="
        max-width: 800px;
        margin: 20px auto;
        padding: 30px 40px;
        background: ${bgColor};
        border: 2px solid ${borderColor};
        border-radius: 12px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        text-align: center;
        font-family: ${fontFamily};
        position: relative;
      ">
        <style>
          @keyframes fadeHeadline {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
          @media (max-width: 768px) {
            #smart-button-widget {
              margin: 15px 10px !important;
              padding: 20px 25px !important;
            }
            #smart-button-headline {
              font-size: 20px !important;
            }
            #smart-button-cta-btn {
              padding: 14px 28px !important;
              font-size: 15px !important;
            }
            #smart-button-branding {
              margin-top: 15px !important;
            }
          }
        </style>

        ${headlineSection}

        <a href="${buttonLink}"
           id="smart-button-cta-btn"
           style="
          display: inline-block;
          background: ${buttonColor};
          color: ${buttonTextColor};
          padding: 16px 36px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 700;
          font-size: 16px;
          font-family: inherit;
          transition: all 0.3s;
          box-shadow: 0 4px 12px ${buttonColor}40;
        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px ${buttonColor}60'"
           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px ${buttonColor}40'">
          ${buttonText}
        </a>

        ${showBranding ? `
        <div id="smart-button-branding" style="
          margin-top: 12px;
          font-size: 10px;
          opacity: 0.5;
          font-family: inherit;
          text-align: center;
        ">
          <a href="https://cravemedia.io" target="_blank" rel="noopener noreferrer" style="color: #666; text-decoration: none;">
            Powered by cravemedia.io
          </a>
        </div>
        ` : ''}
      </div>
    `;
  }

  // ============================================
  // CREATE MESSAGE VARIANTS
  // ============================================
  function createVariantsFromHeadlines(headlines) {
    const styles = ['helpful', 'urgency', 'social-proof', 'risk-reversal', 'discount'];

    return headlines.map((headline, index) => ({
      headline: headline,
      style: styles[index % styles.length]
    }));
  }

  // ============================================
  // RENDER SMART BUTTON
  // ============================================
  function renderSmartButton(variant) {
    if (state.headlinesEnabled) {
      trackImpression(variant);
    }
    state.currentVariant = variant;

    const existing = document.getElementById('smart-button-widget');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.innerHTML = createSmartButtonHTML(variant, state.config);
    const button = container.firstElementChild;

    // Insert button into the target div
    if (state.targetDiv) {
      state.targetDiv.appendChild(button);
    } else {
      console.error('❌ No target div found for Smart Button placement');
      return;
    }

    // Track conversions
    const ctaBtn = document.getElementById('smart-button-cta-btn');
    ctaBtn.addEventListener('click', () => {
      if (state.headlinesEnabled) {
        trackConversion(state.currentVariant);
      }

      if (window.gtag) {
        gtag('event', 'conversion', {
          'event_category': 'Smart Button Widget',
          'event_label': state.config.button_type,
          'variant': state.currentVariant.headline,
          'variant_style': state.currentVariant.style,
          'button_text': state.sessionButtonText,
          'button_color': state.sessionButtonColor
        });
      }
    });
  }

  // ============================================
  // ROTATE HEADLINES
  // ============================================
  function startRotation(variants) {
    if (variants.length <= 1 || !state.headlinesEnabled) return;

    state.rotationTimer = setInterval(() => {
      state.currentIndex = (state.currentIndex + 1) % variants.length;
      const nextVariant = variants[state.currentIndex];

      // Update state immediately
      state.currentVariant = nextVariant;
      trackImpression(nextVariant);

      // Fade transition
      const headlineEl = document.getElementById('smart-button-headline');

      if (headlineEl) {
        headlineEl.style.animation = 'fadeHeadline 0.6s ease-in-out';

        setTimeout(() => {
          headlineEl.textContent = nextVariant.headline;
        }, 300);
      }
    }, 10000); // 10 seconds
  }

  // ============================================
  // ANALYTICS
  // ============================================
  function showAnalytics() {
    const perfData = getPerformanceData();
    console.log('\n📊 === SMART BUTTON ANALYTICS ===');
    console.log('Client:', CLIENT_ID);
    console.log('Business:', state.config?.business_name);
    console.log('Session Button Text:', state.sessionButtonText);
    console.log('Session Button Color:', state.sessionButtonColor);
    console.log('Headlines Enabled:', state.headlinesEnabled);
    console.log('\nHeadline Performance:');

    let totalImpressions = 0;
    let totalConversions = 0;

    const sortedData = Object.values(perfData).sort((a, b) => {
      const rateA = a.impressions > 0 ? a.conversions / a.impressions : 0;
      const rateB = b.impressions > 0 ? b.conversions / b.impressions : 0;
      return rateB - rateA;
    });

    sortedData.forEach(data => {
      const cvRate = data.impressions > 0
        ? ((data.conversions / data.impressions) * 100).toFixed(1) + '%'
        : '0%';

      console.log(`\n${data.style}:`);
      console.log(`  "${data.headline}"`);
      console.log(`  Impressions: ${data.impressions}`);
      console.log(`  Conversions: ${data.conversions} (${cvRate})`);

      totalImpressions += data.impressions;
      totalConversions += data.conversions;
    });

    const overallRate = totalImpressions > 0
      ? ((totalConversions / totalImpressions) * 100).toFixed(1) + '%'
      : '0%';

    console.log('\n=== OVERALL ===');
    console.log('Total Impressions:', totalImpressions);
    console.log('Total Conversions:', totalConversions);
    console.log('Conversion Rate:', overallRate);
    console.log('================\n');
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  async function init() {
    console.log('🎯 Smart Button Widget initializing...');
    console.log('📦 Widget Version: v50.5 - Div-Based Placement');
    console.log('🆔 Client ID:', CLIENT_ID);

    // Check for placement div - REQUIRED for widget to display
    const targetDiv = document.querySelector('[data-widget="smart-button"]');
    if (!targetDiv) {
      console.log('ℹ️ Smart Button Widget: No placement div found.');
      console.log('💡 Add <div data-widget="smart-button"></div> where you want the button to appear.');
      return;
    }

    console.log('✅ Found placement div:', targetDiv);
    state.targetDiv = targetDiv;

    state.config = await fetchClientConfig();

    if (!state.config) {
      console.error('❌ Could not load config. Widget will not display.');
      return;
    }

    // Check if site is active (not suspended)
    const isActive = await checkIfSiteActive(CLIENT_ID);
    if (!isActive) {
      console.log('🚫 Widget blocked: Site is suspended');
      return;
    }

    // Check domain authorization
    const domainOk = checkDomainMatch(state.config.domain);
    if (!domainOk) {
      console.log('🚫 Widget blocked: Unauthorized domain');
      return;
    }

    // Check if widget is enabled for this client
    const isEnabled = await checkIfWidgetEnabled('smart_button', CLIENT_ID);
    if (!isEnabled) {
      console.log('🚫 Widget blocked: Not enabled for this client');
      return;
    }

    // Get button texts and colors from config
    let buttonTexts = state.config.smart_button_texts || ['Get Started'];
    let buttonColors = state.config.smart_button_colors || [state.config.brand_color || '#007bff'];

    // Parse if they're strings
    if (typeof buttonTexts === 'string') {
      try {
        buttonTexts = JSON.parse(buttonTexts);
      } catch (e) {
        buttonTexts = ['Get Started'];
      }
    }
    if (typeof buttonColors === 'string') {
      try {
        buttonColors = JSON.parse(buttonColors);
      } catch (e) {
        buttonColors = [state.config.brand_color || '#007bff'];
      }
    }

    // Select session-consistent button text and color
    state.sessionButtonText = selectSessionButtonText(buttonTexts);
    state.sessionButtonColor = selectSessionButtonColor(buttonColors);
    state.headlinesEnabled = state.config.smart_button_headlines_enabled !== false;

    console.log('📝 Button Text:', state.sessionButtonText);
    console.log('🎨 Button Color:', state.sessionButtonColor);
    console.log('📋 Headlines Enabled:', state.headlinesEnabled);

    let selectedVariant;
    let variants = [];

    if (state.headlinesEnabled) {
      const headlines = await getHeadlines(state.config);
      variants = createVariantsFromHeadlines(headlines);
      selectedVariant = await selectBestVariantAggregate(variants);
    } else {
      // Create a dummy variant without headline tracking
      selectedVariant = { headline: '', style: 'default' };
      variants = [selectedVariant];
    }

    renderSmartButton(selectedVariant);

    if (variants.length > 1 && state.headlinesEnabled) {
      console.log('🔄 Starting headline rotation');
      startRotation(variants);
    }

    console.log('✅ Smart Button ready!');
    console.log('💡 Type showSmartButtonAnalytics() to view performance');

    window.showSmartButtonAnalytics = showAnalytics;

    window.clearSmartButtonData = function() {
      localStorage.removeItem('smartButtonPerformance_' + CLIENT_ID);
      sessionStorage.removeItem(`smart_button_headlines_${CLIENT_ID}_${window.location.pathname}`);
      sessionStorage.removeItem(`smart_button_text_${CLIENT_ID}`);
      sessionStorage.removeItem(`smart_button_color_${CLIENT_ID}`);
      console.log('✨ Smart Button data cleared!');
      location.reload();
    };
  }

  // ============================================
  // START
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
