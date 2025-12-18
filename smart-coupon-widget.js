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
  const scriptTag = document.currentScript || document.querySelector('script[data-client-id][src*="smart-coupon"]');
  const CLIENT_ID = scriptTag ? scriptTag.getAttribute('data-client-id') : 'test_client_123';

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  const state = {
    config: null,
    currentVariant: null,
    currentIndex: 0,
    rotationTimer: null,
    offers: [],
    headlines: null,
    currentHeadlineIndex: 0,
    headlineRotationTimer: null,
    sessionBackgroundColor: null,
    sessionDesignStyle: null,
    sessionButtonText: null,
    headlinesEnabled: true,
    targetDivs: [],
    instances: []
  };

  // ============================================
  // DOMAIN VALIDATION & WIDGET ENFORCEMENT
  // ============================================
  function checkDomainMatch(allowedDomain) {
    if (!allowedDomain) return true;

    const currentDomain = window.location.hostname.toLowerCase();
    const cleanCurrent = currentDomain.replace(/^www\./, '');
    const cleanAllowed = allowedDomain.toLowerCase().replace(/^www\./, '');

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
        return true;
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
      return true;
    }
  }

  // ============================================
  // FETCH CONFIG FROM SUPABASE
  // ============================================
  async function fetchClientConfig() {
    try {
      console.log('🎟️ Fetching Smart Coupons config for client:', CLIENT_ID);

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
        console.log('✅ Smart Coupons config loaded:', config.business_name);
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
  // FETCH COUPON OFFERS
  // ============================================
  async function fetchCouponOffers() {
    try {
      console.log('🎟️ Fetching coupon offers for client:', CLIENT_ID);

      const response = await fetch(
        `${SUPABASE.url}/rest/v1/coupon_offers?client_id=eq.${CLIENT_ID}&is_active=eq.true&order=offer_number.asc`,
        {
          headers: {
            'apikey': SUPABASE.key,
            'Authorization': `Bearer ${SUPABASE.key}`
          }
        }
      );

      const data = await response.json();

      console.log('🔍 Raw coupon offers response:', data);

      if (data && data.length > 0) {
        console.log(`✅ Loaded ${data.length} coupon offers`);
        return data;
      } else {
        console.warn('⚠️ No active coupon offers found');
        return [];
      }
    } catch (error) {
      console.error('❌ Error fetching coupon offers:', error);
      return [];
    }
  }

  // ============================================
  // FETCH HEADLINES FROM PAGE_HEADLINES TABLE
  // ============================================
  async function fetchHeadlines(config) {
    // Check if headlines are enabled
    if (!config.smart_coupon_headlines_enabled) {
      console.log('📋 Headlines disabled for Smart Coupons');
      return null;
    }

    const currentPath = window.location.pathname;
    const cacheKey = `smart_coupon_headlines_${CLIENT_ID}_${currentPath}`;

    // Check cache
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
      console.log('📝 No page-specific headlines found');
      state.canonicalPageUrl = currentPath;
      return null;
    } catch (error) {
      console.error('❌ Error loading headlines:', error);
      state.canonicalPageUrl = currentPath;
      return null;
    }
  }

  // ============================================
  // SESSION-BASED VARIANT SELECTION
  // ============================================
  function selectSessionBackgroundColor(colors) {
    const sessionKey = `smart_coupon_bg_${CLIENT_ID}`;
    const cached = sessionStorage.getItem(sessionKey);

    if (cached && colors.includes(cached)) {
      console.log('📦 Using cached background color:', cached);
      return cached;
    }

    const selected = colors[Math.floor(Math.random() * colors.length)];
    sessionStorage.setItem(sessionKey, selected);
    console.log('🎨 Selected background color for session:', selected);
    return selected;
  }

  function selectSessionDesignStyle(styles) {
    const sessionKey = `smart_coupon_style_${CLIENT_ID}`;
    const cached = sessionStorage.getItem(sessionKey);

    if (cached && styles.includes(cached)) {
      console.log('📦 Using cached design style:', cached);
      return cached;
    }

    const selected = styles[Math.floor(Math.random() * styles.length)];
    sessionStorage.setItem(sessionKey, selected);
    console.log('🎭 Selected design style for session:', selected);
    return selected;
  }

  function selectSessionButtonText(buttonTexts) {
    const sessionKey = `smart_coupon_button_${CLIENT_ID}`;
    const cached = sessionStorage.getItem(sessionKey);

    if (cached && buttonTexts.includes(cached)) {
      console.log('📦 Using cached button text:', cached);
      return cached;
    }

    const selected = buttonTexts[Math.floor(Math.random() * buttonTexts.length)];
    sessionStorage.setItem(sessionKey, selected);
    console.log('📝 Selected button text for session:', selected);
    return selected;
  }

  function selectSessionOffer(offers) {
    const sessionKey = `smart_coupon_offer_${CLIENT_ID}`;
    const cached = sessionStorage.getItem(sessionKey);

    // If we have a cached offer number, find the matching offer
    if (cached) {
      const cachedOfferNumber = parseInt(cached);
      const cachedOffer = offers.find(o => o.offer_number === cachedOfferNumber);

      if (cachedOffer) {
        console.log('📦 Using cached offer #' + cachedOfferNumber + ':', cachedOffer.headline);
        return cachedOffer;
      }
    }

    // No cached offer or it's no longer valid, select randomly
    const selected = offers[Math.floor(Math.random() * offers.length)];
    sessionStorage.setItem(sessionKey, selected.offer_number.toString());
    console.log('🎟️ Selected offer #' + selected.offer_number + ' for session:', selected.headline);
    return selected;
  }

  // ============================================
  // EXPIRATION DATE CALCULATION
  // ============================================
  function calculateExpirationDate(mode) {
    if (mode === 'none') return null;

    const now = new Date();
    let expirationDate;

    if (mode === 'rolling_7days') {
      // Next Saturday (7 days cycle)
      const daysUntilSaturday = (6 - now.getDay() + 7) % 7 || 7;
      expirationDate = new Date(now);
      expirationDate.setDate(now.getDate() + daysUntilSaturday);
    } else if (mode === 'rolling_14days') {
      // 14 days from today
      expirationDate = new Date(now);
      expirationDate.setDate(now.getDate() + 14);
    }

    // Format as "Expires Dec 15, 2025"
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return 'Expires ' + expirationDate.toLocaleDateString('en-US', options);
  }

  // ============================================
  // COLOR ADJUSTMENT HELPER (darkening for gradients)
  // ============================================
  function adjustColor(color, percent) {
    const num = parseInt(color.replace("#",""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 +
      (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255))
      .toString(16).slice(1);
  }

  // ============================================
  // URL MATCHING FOR OFFER FILTERING
  // ============================================
  function matchesUrl(currentPath, targetUrl) {
    if (!targetUrl) return false;

    // Extract pathname from full URLs (https://example.com/page -> /page)
    const extractPath = (url) => {
      // If it's a full URL (starts with http:// or https://)
      if (url.match(/^https?:\/\//i)) {
        try {
          const urlObj = new URL(url);
          return urlObj.pathname;
        } catch (e) {
          // If URL parsing fails, return as-is
          return url;
        }
      }

      // If it looks like a domain without protocol (example.com/path or www.example.com/path)
      // Check for pattern: word.word/something OR www.word.word/something
      if (url.match(/^([a-z0-9-]+\.)+[a-z]{2,}\//i)) {
        try {
          // Add https:// and parse
          const urlObj = new URL('https://' + url);
          return urlObj.pathname;
        } catch (e) {
          // If parsing fails, return as-is
          return url;
        }
      }

      // Already a path (starts with / or is just a path)
      return url;
    };

    // Normalize paths - remove trailing slash unless it's the root path "/"
    const normalizePath = (path) => {
      if (path === '/' || !path) return path;
      return path.replace(/\/$/, ''); // Remove trailing slash
    };

    const normalizedCurrent = normalizePath(extractPath(currentPath));
    const normalizedTarget = normalizePath(extractPath(targetUrl));

    // Handle wildcards
    if (normalizedTarget.includes('*')) {
      const pattern = normalizedTarget.replace(/\*/g, '.*');
      const regex = new RegExp('^' + pattern + '$');
      return regex.test(normalizedCurrent);
    }

    // Exact match (after normalization)
    return normalizedCurrent === normalizedTarget;
  }

  function isOfferVisibleOnCurrentPage(offer) {
    // If custom URL is not enabled, show on all pages (global offer)
    if (!offer.use_custom_url) {
      return true;
    }

    const currentPath = window.location.pathname;

    // Parse excluded URLs
    let excludedUrls = offer.excluded_urls || [];
    if (typeof excludedUrls === 'string') {
      try {
        excludedUrls = JSON.parse(excludedUrls);
      } catch (e) {
        excludedUrls = [];
      }
    }
    if (!Array.isArray(excludedUrls)) excludedUrls = [];

    // Check if current page is excluded (takes precedence)
    for (let i = 0; i < excludedUrls.length; i++) {
      if (matchesUrl(currentPath, excludedUrls[i])) {
        console.log(`🚫 Offer ${offer.offer_number} excluded from ${currentPath}`);
        return false;
      }
    }

    // Parse additional URLs
    let additionalUrls = offer.additional_urls || [];
    if (typeof additionalUrls === 'string') {
      try {
        additionalUrls = JSON.parse(additionalUrls);
      } catch (e) {
        additionalUrls = [];
      }
    }
    if (!Array.isArray(additionalUrls)) additionalUrls = [];

    // Check primary URL
    if (offer.primary_page_url && matchesUrl(currentPath, offer.primary_page_url)) {
      return true;
    }

    // Check additional URLs
    for (let i = 0; i < additionalUrls.length; i++) {
      if (matchesUrl(currentPath, additionalUrls[i])) {
        return true;
      }
    }

    // No match found
    return false;
  }

  // ============================================
  // ANALYTICS TRACKING
  // ============================================
  async function sendToSupabase(eventType, variant) {
    try {
      await fetch(`${SUPABASE.url}/rest/v1/coupon_performance`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE.key,
          'Authorization': `Bearer ${SUPABASE.key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          offer_number: variant.offer_number,
          background_color: state.sessionBackgroundColor,
          design_style: variant.design_style || 'dashed',
          headline: variant.headline,
          button_text: state.sessionButtonText,
          event_type: eventType,
          page_url: window.location.pathname,
          user_agent: navigator.userAgent
        })
      });
    } catch (error) {
      console.error('Error sending to Supabase:', error);
    }
  }

  function trackImpression(variant) {
    const rotationKey = `coupon_impression_${CLIENT_ID}_${variant.offer_number}_${state.currentIndex}`;

    if (sessionStorage.getItem(rotationKey)) {
      console.log('📊 Impression already tracked for this rotation');
      return;
    }

    sessionStorage.setItem(rotationKey, 'true');
    console.log('📊 Coupon impression:', variant.headline);
    sendToSupabase('impression', variant);
  }

  function trackClick(variant) {
    console.log('🎯 COUPON CLICK!', {
      offer: variant.headline,
      offerNumber: variant.offer_number,
      style: state.sessionDesignStyle,
      color: state.sessionBackgroundColor,
      buttonText: state.sessionButtonText
    });
    sendToSupabase('click', variant);
  }

  // ============================================
  // CREATE COUPON HTML (3 STYLES)
  // ============================================
  // ============================================
  // GET CURRENT ROTATING HEADLINE
  // ============================================

  // Select best-performing headline using aggregate stats (A/B testing)
  async function selectBestHeadlineAggregate() {
    if (!state.headlines || state.headlines.length === 0) {
      return 0; // Return index 0 if no headlines
    }

    const epsilon = 0.2; // 20% exploration rate
    const pageUrl = state.canonicalPageUrl || window.location.pathname;

    // 20% of the time, explore by showing random headline
    if (Math.random() < epsilon) {
      const randomIndex = Math.floor(Math.random() * state.headlines.length);
      console.log('🎲 Coupon Headline: Exploring (random):', state.headlines[randomIndex]);
      return randomIndex;
    }

    try {
      // Use public analytics API endpoint (no JWT required for widgets)
      const response = await fetch(
        'https://conversion-widget.vercel.app/api/analytics/headlines-public?client_id=' + CLIENT_ID + '&page_url=' + encodeURIComponent(pageUrl)
      );

      if (!response.ok) {
        console.warn('📊 Coupon Headline: Analytics API error:', response.status, '- Using first headline');
        return 0;
      }

      const stats = await response.json();

      if (!stats || stats.length === 0) {
        console.log('📊 Coupon Headline: No stats yet, showing first headline');
        return 0;
      }

      // Find the best headline by conversion rate
      let bestHeadline = null;
      let bestRate = 0;

      stats.forEach(stat => {
        if (stat.conversion_rate > bestRate) {
          bestRate = stat.conversion_rate;
          bestHeadline = stat.headline;
        }
      });

      if (!bestHeadline) {
        return 0;
      }

      // Find index of best headline
      const bestIndex = state.headlines.findIndex(h => h === bestHeadline);

      if (bestIndex !== -1) {
        console.log('🏆 Coupon Headline: Global winner (' + bestRate.toFixed(2) + '%):', bestHeadline);
        return bestIndex;
      }

      return 0;

    } catch (error) {
      console.error('📊 Coupon Headline: Error fetching stats:', error);
      return 0;
    }
  }

  function getCurrentHeadline() {
    if (!state.headlines || state.headlines.length === 0) {
      return null;
    }
    return state.headlines[state.currentHeadlineIndex];
  }

  function createCouponHTML(variant, config, instanceIndex = 0) {
    // Determine button link
    let buttonLink;
    if (config.smart_coupon_use_custom_url && config.smart_coupon_custom_url && config.smart_coupon_custom_url.trim()) {
      let customUrl = config.smart_coupon_custom_url.trim();
      if (!customUrl.match(/^https?:\/\//i) && !customUrl.startsWith('tel:') && !customUrl.startsWith('mailto:')) {
        customUrl = 'https://' + customUrl;
      }
      buttonLink = customUrl;
    } else {
      buttonLink = config.button_type === 'call'
        ? `tel:${config.phone_number.replace(/\D/g, '')}`
        : config.booking_url;
    }

    const bgColor = state.sessionBackgroundColor;
    const darkenedColor = adjustColor(bgColor, -20);

    // Get all possible styles for this offer (per-offer design styles)
    let offerStyles = variant.design_styles || ['dashed'];

    // Ensure it's an array
    if (!Array.isArray(offerStyles)) {
      // Handle if it came as JSONB string
      try {
        offerStyles = JSON.parse(offerStyles);
      } catch (e) {
        offerStyles = ['dashed'];
      }
    }

    // Select one style for this offer using session-based persistence
    const sessionKey = `smart_coupon_style_offer_${variant.offer_number}_${CLIENT_ID}`;
    const cached = sessionStorage.getItem(sessionKey);

    let style;
    if (cached && offerStyles.includes(cached)) {
      style = cached;
      console.log('📦 Using cached style for offer #' + variant.offer_number + ':', style);
    } else {
      style = offerStyles[Math.floor(Math.random() * offerStyles.length)];
      sessionStorage.setItem(sessionKey, style);
      console.log('🎭 Selected style for offer #' + variant.offer_number + ':', style);
    }

    // Store the selected style in variant for analytics tracking
    variant.design_style = style;

    const buttonColor = config.smart_coupon_button_color || '#fed80e';
    const buttonTextColor = config.smart_coupon_button_text_color || '#000000';
    const headlineTextColor = config.smart_coupon_offer_text_color || '#ffffff';
    const disclaimerTextColor = config.smart_coupon_disclaimer_text_color || '#ffffff';

    // Get ribbon text for Elegant Badge style
    let ribbonText = config.smart_coupon_badge_ribbon_text || 'LIMITED TIME';
    if (ribbonText === 'custom') {
      ribbonText = config.smart_coupon_badge_ribbon_custom || 'LIMITED';
    } else if (ribbonText === 'none') {
      ribbonText = ''; // No ribbon
    }

    // Get VIP badge text for Elegant Badge style
    let vipBadgeText = config.smart_coupon_vip_badge_text || 'VIP OFFER';
    if (vipBadgeText === 'custom') {
      vipBadgeText = config.smart_coupon_vip_badge_custom || 'VIP OFFER';
    } else if (vipBadgeText === 'none') {
      vipBadgeText = ''; // No VIP badge
    }
    const buttonText = state.sessionButtonText;
    const fontFamily = '"Open Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const showBranding = config.show_branding !== false;

    // Format discount display
    let discountDisplay;
    if (variant.discount_type === 'percentage') {
      discountDisplay = `${variant.discount_value}% OFF`;
    } else if (variant.discount_type === 'none') {
      discountDisplay = `$${variant.discount_value}`;  // Price only, no "OFF"
    } else {
      discountDisplay = `$${variant.discount_value} OFF`;
    }

    // Calculate expiration if enabled
    const expirationText = calculateExpirationDate(variant.expiration_mode);
    const expirationHTML = expirationText ? `
      <p class="coupon-expiration" style="
        font-size: 12px;
        font-weight: 600;
        margin-top: ${variant.expiration_display === 'below_headline' ? '0px' : '0px'};
	margin-bottom: 0px;
        opacity: 0.95;
        text-transform: uppercase;
        letter-spacing: 1px;
      ">
        ${expirationText}
      </p>
    ` : '';

    // Get rotating headline (if enabled)
    const rotatingHeadline = getCurrentHeadline();
    const headlineColorForRotating = config.smart_coupon_headline_text_color || '#333333';

    // Headline HTML (outside coupon, like Smart Button)
    const headlineHTML = rotatingHeadline ? `
      <style>
        @keyframes fadeHeadline {
          0% { opacity: 0; transform: translateY(-10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      </style>
      <div class="rotating-headline" style="
        margin: 0 0 35px 0;
        text-align: center;
        font-family: ${fontFamily};
      ">
        <div class="smart-coupon-headline" style="
          margin: 0 0 20px;
          font-size: 28px;
          font-weight: 700;
          line-height: 1.3;
          color: ${headlineColorForRotating};
          font-family: inherit;
          animation: 0.6s ease-in-out 0s 1 normal none running fadeHeadline;
        ">
          ${rotatingHeadline}
        </div>
      </div>
    ` : '';

    // Fixed font sizing for Elegant Badge
    const badgeHeadlineFontSize = 22;
    const badgeDiscountFontSize = 50;

    // Style-specific HTML
    let couponStyleHTML = '';

    if (style === 'dashed') {
      // Style 1: Dashed Border
      couponStyleHTML = `
        ${headlineHTML}
        <div class="smart-coupon-widget" data-instance="${instanceIndex}" style="
          max-width: 500px;
          margin: 20px auto;
          border: 6px dashed #ffffff;
          border-radius: 25px;
          background: linear-gradient(120deg, ${bgColor} 0%, ${darkenedColor} 100%);
          box-shadow: 2px 2px 10px 2px rgba(0,0,0,0.3);
          padding: 40px;
          text-align: center;
          color: ${headlineTextColor};
          font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        ">
          <div class="coupon-headline" style="
            font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 30px;
            font-weight: 700;
            margin-top: 25px;
            line-height: 1.2;
            color: ${headlineTextColor};
          ">
            ${variant.headline}
          </div>
          ${variant.expiration_display === 'below_headline' ? expirationHTML : ''}
          <div class="coupon-discount" style="
            font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 75px;
            font-weight: 900;
            margin: 20px 0;
            line-height: 1;
          ">
            ${discountDisplay}
          </div>
          <a href="${buttonLink}" class="coupon-button" onclick="window.smartCouponClick && window.smartCouponClick()" style="
            display: inline-block;
            background: ${buttonColor};
            color: ${buttonTextColor};
            padding: 15px 40px;
            border-radius: 50px;
            font-size: 18px;
            font-weight: 600;
            text-decoration: none;
            margin: 5px 0;
            transition: all 0.3s;
            cursor: pointer;
          ">${buttonText}</a>
          ${variant.disclaimer ? `
            <p class="coupon-disclaimer" style="
              font-size: 12px;
              margin-top: 20px;
              line-height: 1.4;
              opacity: 0.95;
              color: ${disclaimerTextColor};
            ">
              ${variant.disclaimer}
            </p>
          ` : ''}
          ${variant.expiration_display === 'below_disclaimer' ? expirationHTML : ''}
        </div>
      `;
    } else if (style === 'ticket') {
      // Style 2: Modern Ticket (clean border + hover lift)
      couponStyleHTML = `
        ${headlineHTML}
        <div class="smart-coupon-widget smart-coupon-ticket" data-instance="${instanceIndex}" style="
          max-width: 500px;
          margin: 20px auto;
          border: 4px solid #ffffff;
          border-radius: 12px;
          background: linear-gradient(135deg, ${bgColor} 0%, ${darkenedColor} 100%);
          box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.1);
          padding: 40px;
          text-align: center;
          color: ${headlineTextColor};
          position: relative;
          overflow: visible;
          transition: transform 0.3s, box-shadow 0.3s;
          cursor: pointer;
          font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        ">
          <style>
            .smart-coupon-ticket:hover {
              transform: translateY(-6px);
              box-shadow: 0 12px 40px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.15);
            }
          </style>
          <div class="coupon-headline" style="
            font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 30px;
            font-weight: 700;
            margin: 0 0 20px 0;
            line-height: 1.2;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: ${headlineTextColor};
          ">
            ${variant.headline}
          </div>
          ${variant.expiration_display === 'below_headline' ? expirationHTML : ''}
          <div class="coupon-discount" style="
            font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            font-size: 75px;
            font-weight: 900;
            margin: 5px 0;
            line-height: 1;
            letter-spacing: -2px;
          ">
            ${discountDisplay}
          </div>
          <a href="${buttonLink}" class="coupon-button" onclick="window.smartCouponClick && window.smartCouponClick()" style="
            display: inline-block;
            background: ${buttonColor};
            color: ${buttonTextColor};
            padding: 15px 40px;
            border-radius: 50px;
            font-size: 18px;
            font-weight: 700;
            text-decoration: none;
            margin: 20px 0;
            transition: all 0.3s;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 1px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          ">${buttonText}</a>
          ${variant.disclaimer ? `
            <p class="coupon-disclaimer" style="
              font-size: 12px;
              margin-top: 20px;
              line-height: 1.4;
              opacity: 0.95;
              color: ${disclaimerTextColor};
            ">
              ${variant.disclaimer}
            </p>
          ` : ''}
          ${variant.expiration_display === 'below_disclaimer' ? expirationHTML : ''}
        </div>
      `;
    } else if (style === 'badge') {
      // Style 3: Elegant Badge (circular seal) - matching original draft
      const safeFont = fontFamily.replace(/'/g, "\\'");
      couponStyleHTML = `
        ${headlineHTML}
        <div class="smart-coupon-container" style="
          max-width: 400px;
          margin: 40px auto;
          position: relative;
          font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        ">
          <div class="smart-coupon-widget smart-coupon-badge" data-instance="${instanceIndex}" style="
            border: 4px solid #ffffff;
            border-radius: 50%;
            background: radial-gradient(circle, ${bgColor} 0%, ${darkenedColor} 100%);
            box-shadow: 0 4px 20px rgba(0,0,0,0.3), inset 0 0 0 8px rgba(255,255,255,0.2);
            padding: 50px 40px;
            text-align: center;
            color: ${headlineTextColor};
            position: relative;
            width: 320px;
            height: 320px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            margin: 40px auto;
            font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          ">
            ${ribbonText ? `<div class="smart-coupon-ribbon" style="
              position: absolute;
              top: 28px;
              right: -26px;
              background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%);
              color: #000;
              padding: 6px 26px;
              font-size: 11px;
              font-weight: 900;
              transform: rotate(20deg);
              box-shadow: 0 3px 10px rgba(0,0,0,0.3);
              letter-spacing: 1.1px;
              border: 2px solid #ffeb3b;
              white-space: nowrap;
              font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            ">${ribbonText}</div>` : ''}
            ${vipBadgeText ? `<div class="vip-badge" style="
              position: absolute;
              top: -10px;
              left: 50%;
              transform: translateX(-50%);
              background: #ffd700;
              color: #000;
              padding: 4px 16px;
              border-radius: 20px;
              font-size: 10px;
              font-weight: 900;
              letter-spacing: 2px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.2);
              font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            ">${vipBadgeText}</div>` : ''}
            <div class="coupon-headline" style="
              font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              font-size: ${badgeHeadlineFontSize}px;
              font-weight: 700;
              margin: 40px 0 10px 0;
              line-height: 1.2;
              text-transform: uppercase;
              letter-spacing: 1px;
              color: ${headlineTextColor};
              text-align: center;
            ">
              ${variant.headline}
            </div>
            ${variant.expiration_display === 'below_headline' ? expirationHTML : ''}
            <div class="coupon-discount" style="
              font-family: 'Open Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              font-size: ${badgeDiscountFontSize}px;
              font-weight: 900;
              margin: 0px 0;
              line-height: 1;
              text-shadow: 0 2px 8px rgba(0,0,0,0.3);
              text-align: center;
            ">
              ${discountDisplay}
            </div>
            <a href="${buttonLink}" class="coupon-button" onclick="window.smartCouponClick && window.smartCouponClick()" style="
              display: inline-block;
              background: ${buttonColor};
              color: ${buttonTextColor};
              padding: 11px 32px;
              border-radius: 50px;
              font-size: 15px;
              font-weight: 700;
              text-decoration: none;
              margin: 8px 0;
              transition: all 0.3s;
              cursor: pointer;
              text-transform: uppercase;
              letter-spacing: 1px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            ">${buttonText}</a>
            ${variant.expiration_display === 'below_disclaimer' ? expirationHTML : ''}
            ${variant.disclaimer ? `
              <div style="position: relative; display: inline-block; margin-top: ${expirationText ? '-10px' : '-10px'};">
                <div class="elegant-badge-disclaimer-trigger" style="
                  display: inline-block;
		  margin-bottom: 10px;
                  padding: 0px 0px;
                  border-radius: 0px;
                  background: rgba(255,255,255,0);
                  color: ${disclaimerTextColor};
                  text-align: center;
                  cursor: pointer;
                  font-size: 11px;
                  font-weight: 600;
                  transition: all 0.3s;
                  text-decoration: underline;
                ">Read More</div>
                <div class="elegant-badge-disclaimer-content" style="
                  display: none;
                  position: absolute;
                  bottom: calc(100% + 10px);
                  left: 50%;
                  transform: translateX(-50%);
                  background: rgba(0,0,0,0.95);
                  color: white;
                  padding: 10px 15px;
                  border-radius: 8px;
                  font-size: 11px;
                  white-space: normal;
                  max-width: 250px;
                  width: max-content;
                  z-index: 1000;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                  pointer-events: none;
                ">${variant.disclaimer}</div>
              </div>
              <style>
                .elegant-badge-disclaimer-trigger:hover {
                  background: rgba(255,255,255,0.5);
                  transform: scale(1.1);
                }
                .elegant-badge-disclaimer-trigger:hover + .elegant-badge-disclaimer-content,
                .elegant-badge-disclaimer-trigger:active + .elegant-badge-disclaimer-content {
                  display: block !important;
                }
                @media (max-width: 768px) {
                  .elegant-badge-disclaimer-trigger:active + .elegant-badge-disclaimer-content {
                    display: block !important;
                  }
                }
              </style>
            ` : ''}
          </div>
        </div>
      `;
    }

    // Add branding if enabled
    const brandingHTML = showBranding ? `
      <div class="smart-coupon-branding" style="
        text-align: center;
        margin-top: 15px;
        font-size: 11px;
        color: #999;
        font-family: ${fontFamily};
      ">
        Powered by <a href="https://www.cravemedia.io" target="_blank" style="color: #667eea; text-decoration: none;">Crave Media</a>
      </div>
    ` : '';

    return couponStyleHTML + brandingHTML;
  }

  // ============================================
  // RENDER COUPON IN TARGET DIVS
  // ============================================
  function renderCoupon(variant) {
    // Store current variant for headline rotation
    state.currentVariant = variant;

    // Find all divs where coupon should be embedded
    state.targetDivs = document.querySelectorAll('div[data-coupon-widget]');

    if (state.targetDivs.length === 0) {
      console.warn('⚠️ No <div data-coupon-widget></div> found on page');
      return;
    }

    console.log(`🎟️ Rendering coupon in ${state.targetDivs.length} location(s)`);

    // Clear existing instances
    state.instances.forEach(instance => {
      if (instance && instance.parentNode) {
        instance.parentNode.removeChild(instance);
      }
    });
    state.instances = [];

    // Render in each target div
    state.targetDivs.forEach((targetDiv, index) => {
      const html = createCouponHTML(variant, state.config, index);
      targetDiv.innerHTML = html;

      // Store reference to rendered instance
      const instance = targetDiv.querySelector('.smart-coupon-widget');
      if (instance) {
        state.instances.push(instance);
      }
    });

    // Track impression (once per rotation, not per instance)
    trackImpression(variant);

    // Setup click tracking
    window.smartCouponClick = function() {
      trackClick(variant);
    };
  }

  // ============================================
  // VARIANT CREATION & ROTATION
  // ============================================
  function createVariantsFromOffers(offers) {
    return offers.map(offer => ({
      offer_number: offer.offer_number,
      headline: offer.headline,
      discount_type: offer.discount_type,
      discount_value: offer.discount_value,
      button_text: offer.button_text,
      disclaimer: offer.disclaimer,
      expiration_mode: offer.expiration_mode,
      expiration_display: offer.expiration_display
    }));
  }

  // ============================================
  // HEADLINE ROTATION
  // ============================================
  function startHeadlineRotation() {
    if (!state.headlines || state.headlines.length <= 1) {
      return; // No need to rotate if 0 or 1 headline
    }

    const HEADLINE_ROTATION_INTERVAL = 8000; // 8 seconds

    if (state.headlineRotationTimer) {
      clearInterval(state.headlineRotationTimer);
    }

    state.headlineRotationTimer = setInterval(() => {
      state.currentHeadlineIndex = (state.currentHeadlineIndex + 1) % state.headlines.length;
      console.log('📋 Rotating headline:', state.headlines[state.currentHeadlineIndex]);

      // Re-render current coupon to update headline
      if (state.currentVariant) {
        renderCoupon(state.currentVariant);
      }
    }, HEADLINE_ROTATION_INTERVAL);
  }

  // ============================================
  // OFFER ROTATION
  // ============================================
  function startRotation(variants) {
    const ROTATION_INTERVAL = 30000; // 30 seconds

    if (state.rotationTimer) {
      clearInterval(state.rotationTimer);
    }

    state.rotationTimer = setInterval(() => {
      state.currentIndex = (state.currentIndex + 1) % variants.length;
      const nextVariant = variants[state.currentIndex];
      console.log('🔄 Rotating to offer:', nextVariant.headline);
      renderCoupon(nextVariant);
    }, ROTATION_INTERVAL);
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  async function init() {
    try {
      console.log('🎟️ Smart Coupons Widget initializing...');
      console.log('📍 Client ID:', CLIENT_ID);

      // Load Open Sans font
      if (!document.querySelector('link[href*="Open+Sans"]')) {
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600;700;800;900&display=swap';
        document.head.appendChild(fontLink);
      }

      // Fetch config
      state.config = await fetchClientConfig();
      if (!state.config) {
        console.error('❌ Cannot load widget: No configuration found');
        return;
      }

      // Check domain match
      if (state.config.domain && !checkDomainMatch(state.config.domain)) {
        console.error('❌ Domain validation failed');
        return;
      }

      // Check if site is active
      const siteActive = await checkIfSiteActive(CLIENT_ID);
      if (!siteActive) {
        console.error('❌ Site is suspended');
        return;
      }

      // Check if widget is enabled
      const widgetEnabled = await checkIfWidgetEnabled('smart_coupon', CLIENT_ID);
      if (!widgetEnabled) {
        console.error('❌ Smart Coupons widget is not enabled');
        return;
      }

      // Fetch coupon offers
      const allOffers = await fetchCouponOffers();
      if (allOffers.length === 0) {
        console.warn('⚠️ No active coupon offers found - widget will not display');
        return;
      }

      // Filter offers based on current page URL
      state.offers = allOffers.filter(offer => isOfferVisibleOnCurrentPage(offer));

      if (state.offers.length === 0) {
        console.log(`📍 No offers match the current page: ${window.location.pathname}`);
        console.log(`💡 Tip: Offers with custom URLs only show on matching pages. Check your URL targeting settings.`);
        return;
      }

      console.log(`✅ ${state.offers.length} of ${allOffers.length} offers match this page`);
      state.offers.forEach(offer => {
        console.log(`   - Offer ${offer.offer_number}: ${offer.headline}${offer.use_custom_url ? ' (URL-targeted)' : ' (global)'}`);
      });

      // Fetch headlines (if enabled)
      state.headlines = await fetchHeadlines(state.config);
      if (state.headlines && state.headlines.length > 0) {
        console.log(`📋 Loaded ${state.headlines.length} headlines for rotation`);

        // Select best-performing headline using A/B testing analytics
        state.currentHeadlineIndex = await selectBestHeadlineAggregate();
      }

      // Parse JSONB columns
      let backgroundColors = state.config.smart_coupon_background_colors || ['#008b45', '#d32f2f', '#1976d2'];
      let designStyles = state.config.smart_coupon_design_styles || ['dashed', 'ticket', 'badge'];
      let buttonTexts = state.config.smart_coupon_button_texts || ['Schedule Now', 'Get Offer', 'Claim Discount'];

      if (typeof backgroundColors === 'string') {
        try {
          backgroundColors = JSON.parse(backgroundColors);
        } catch (e) {
          backgroundColors = ['#008b45'];
        }
      }

      // Limit colors based on plan tier (Trial/Starter = 3 colors, Pro+ = 5 colors)
      const isComplimentary = state.config.is_complimentary || false;
      const plan = state.config.subscription_plan || 'starter';
      const isPro = plan === 'professional' || plan === 'premium' || plan === 'expert' || plan === 'unlimited';

      if (!isComplimentary && !isPro && backgroundColors.length > 3) {
        console.log('🎨 Trial/Starter plan detected - limiting to first 3 background colors');
        backgroundColors = backgroundColors.slice(0, 3);
      }
      if (typeof designStyles === 'string') {
        try {
          designStyles = JSON.parse(designStyles);
        } catch (e) {
          designStyles = ['dashed'];
        }
      }
      if (typeof buttonTexts === 'string') {
        try {
          buttonTexts = JSON.parse(buttonTexts);
        } catch (e) {
          buttonTexts = ['Schedule Now'];
        }
      }

      // Limit button texts based on plan tier (Trial/Starter = 3 texts, Pro+ = 5 texts)
      if (!isComplimentary && !isPro && buttonTexts.length > 3) {
        console.log('📝 Trial/Starter plan detected - limiting to first 3 button texts');
        buttonTexts = buttonTexts.slice(0, 3);
      }

      // Select session-consistent variants
      state.sessionBackgroundColor = selectSessionBackgroundColor(backgroundColors);

      // Check if style rotation is enabled (default: false for backward compatibility)
      const allowStyleRotation = state.config.smart_coupon_allow_style_rotation || false;

      if (allowStyleRotation && designStyles.length > 1) {
        state.sessionDesignStyle = selectSessionDesignStyle(designStyles);
        console.log('🔄 Design style rotation enabled - using:', state.sessionDesignStyle);
      } else {
        state.sessionDesignStyle = designStyles[0] || 'dashed';
        console.log('🎭 Design style rotation disabled - using first option:', state.sessionDesignStyle);
      }

      // Check if button text rotation is enabled (default: false for backward compatibility)
      const allowButtonRotation = state.config.smart_coupon_allow_button_rotation || false;

      if (allowButtonRotation && buttonTexts.length > 1) {
        state.sessionButtonText = selectSessionButtonText(buttonTexts);
        console.log('🔄 Button text rotation enabled - using:', state.sessionButtonText);
      } else {
        state.sessionButtonText = buttonTexts[0] || 'Schedule Now';
        console.log('📝 Button text rotation disabled - using first option:', state.sessionButtonText);
      }

      console.log('🎨 Background Color:', state.sessionBackgroundColor);
      console.log('🎭 Design Style:', state.sessionDesignStyle);

      // Select ONE offer for this user's session (A/B testing)
      const selectedOffer = selectSessionOffer(state.offers);

      // Create variant from selected offer
      const selectedVariant = {
        offer_number: selectedOffer.offer_number,
        headline: selectedOffer.headline,
        discount_type: selectedOffer.discount_type,
        discount_value: selectedOffer.discount_value,
        button_text: selectedOffer.button_text,
        disclaimer: selectedOffer.disclaimer,
        expiration_mode: selectedOffer.expiration_mode,
        expiration_display: selectedOffer.expiration_display,
        design_styles: selectedOffer.design_styles || [selectedOffer.design_style] || ['dashed'], // Support both new array and old single style
        use_custom_url: selectedOffer.use_custom_url,
        primary_page_url: selectedOffer.primary_page_url,
        additional_urls: selectedOffer.additional_urls,
        excluded_urls: selectedOffer.excluded_urls
      };

      renderCoupon(selectedVariant);

      // Start headline rotation if multiple headlines
      if (state.headlines && state.headlines.length > 1) {
        console.log('📋 Starting headline rotation');
        startHeadlineRotation();
      }

      console.log('✅ Smart Coupons Widget ready!');

      // Expose utility functions
      window.clearSmartCouponData = function() {
        sessionStorage.removeItem(`smart_coupon_bg_${CLIENT_ID}`);
        sessionStorage.removeItem(`smart_coupon_style_${CLIENT_ID}`);
        sessionStorage.removeItem(`smart_coupon_button_${CLIENT_ID}`);
        console.log('✨ Smart Coupon data cleared!');
        location.reload();
      };

    } catch (error) {
      console.error('❌ Smart Coupons Widget initialization error:', error);
    }
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
