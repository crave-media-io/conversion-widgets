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
  const scriptTag = document.currentScript || document.querySelector('script[data-client-id][src*="header-banner"]');
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
    canonicalPageUrl: null  // Store the canonical page URL for stats aggregation
  };

  // ============================================
  // DOMAIN VALIDATION
  // ============================================
  function isCurrentDomainAllowed(allowedDomains) {
    // If no domains specified, allow all (fail-open for better UX)
    if (!allowedDomains || allowedDomains.length === 0) {
      return true;
    }

    const currentDomain = window.location.hostname.toLowerCase();

    for (let i = 0; i < allowedDomains.length; i++) {
      const allowed = allowedDomains[i].toLowerCase();

      // Exact match
      if (currentDomain === allowed) {
        return true;
      }

      // Auto-include www subdomain
      if (currentDomain === 'www.' + allowed || allowed === 'www.' + currentDomain) {
        return true;
      }

      // Wildcard support (*.example.com)
      if (allowed.startsWith('*.')) {
        const baseDomain = allowed.substring(2); // Remove *.
        if (currentDomain === baseDomain || currentDomain.endsWith('.' + baseDomain)) {
          return true;
        }
      }
    }

    console.log('🚫 Domain not allowed:', currentDomain, 'Allowed:', allowedDomains);
    return false;
  }

  // ============================================
  // FETCH CONFIG FROM SUPABASE
  // ============================================
  async function fetchClientConfig() {
    try {
      console.log('🎯 Fetching banner config for client:', CLIENT_ID);

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

        // Check domain restrictions
        if (!isCurrentDomainAllowed(config.allowed_domains)) {
          console.log('🚫 Widget blocked: Domain not in allowed list');
          return null;
        }

        console.log('✅ Banner config loaded:', config.business_name);
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
  // FETCH HEADLINES
  // ============================================
  async function getHeadlines(config) {
    const currentPath = window.location.pathname;
    const cacheKey = `banner_headlines_${CLIENT_ID}_${currentPath}`;
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
      const data = localStorage.getItem('bannerPerformance_' + CLIENT_ID);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  function savePerformanceData(data) {
    try {
      localStorage.setItem('bannerPerformance_' + CLIENT_ID, JSON.stringify(data));
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
    console.log('📊 Banner impression:', key);
    
    sendToSupabase('impression', variant);
  }

  function trackConversion(variant) {
    const perfData = getPerformanceData();
    const key = variant.headline;
    
    if (perfData[key]) {
      perfData[key].conversions++;
      savePerformanceData(perfData);
      
      const rate = ((perfData[key].conversions / perfData[key].impressions) * 100).toFixed(1);
      console.log('🎯 BANNER CONVERSION!', {
        headline: key,
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
  // CREATE BANNER HTML
  // ============================================
  function createBannerHTML(variant, config) {
    const buttonText = config.button_type === 'call' 
      ? `📞 Call ${config.phone_number}`
      : '📅 Book Online';
    
    const buttonLink = config.button_type === 'call'
      ? `tel:${config.phone_number.replace(/\D/g, '')}`
      : config.booking_url;

    const borderColor = config.banner_border_color || config.brand_color || '#667eea';
    const bgColor = config.banner_bg_color || '#ffffff';
    const buttonColor = config.brand_color || '#667eea';
    const fontFamily = config.custom_font_family || 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    return `
      <div id="header-banner-widget" style="
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
            #header-banner-widget {
              margin: 15px 10px !important;
              padding: 20px 25px !important;
            }
            #banner-headline {
              font-size: 20px !important;
            }
            #banner-cta-btn {
              padding: 14px 28px !important;
              font-size: 15px !important;
            }
            #banner-branding {
              position: static !important;
              margin-top: 15px !important;
            }
          }
        </style>

        ${config.show_branding !== false ? `
        <div id="banner-branding" style="
          position: absolute;
          top: 8px;
          right: 12px;
          font-size: 9px;
          opacity: 0.4;
          font-family: inherit;
        ">
          <a href="https://cravemedia.io" target="_blank" rel="noopener noreferrer" style="color: #666; text-decoration: none;">
            Powered by cravemedia.io
          </a>
        </div>
        ` : ''}

        <h2 id="banner-headline" style="
          margin: 0 0 20px 0;
          font-size: 28px;
          font-weight: 700;
          line-height: 1.3;
          color: #333;
          font-family: inherit;
        ">
          ${variant.headline}
        </h2>
        
        <a href="${buttonLink}" 
           id="banner-cta-btn"
           style="
          display: inline-block;
          background: ${buttonColor};
          color: white;
          padding: 16px 36px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 700;
          font-size: 16px;
          font-family: inherit;
          transition: all 0.3s;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(102,126,234,0.4)'"
           onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(102,126,234,0.3)'">
          ${buttonText}
        </a>
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
  // RENDER BANNER
  // ============================================
  function renderBanner(variant) {
    trackImpression(variant);
    state.currentVariant = variant;
    
    const existing = document.getElementById('header-banner-widget');
    if (existing) existing.remove();
    
    const container = document.createElement('div');
    container.innerHTML = createBannerHTML(variant, state.config);
    const banner = container.firstElementChild;
    
    // Insert banner where the script tag is located
    if (scriptTag && scriptTag.parentNode) {
      scriptTag.parentNode.insertBefore(banner, scriptTag);
    } else {
      // Fallback: insert at beginning of body
      document.body.insertBefore(banner, document.body.firstChild);
    }
    
    // Track conversions
    const ctaBtn = document.getElementById('banner-cta-btn');
    ctaBtn.addEventListener('click', () => {
      trackConversion(state.currentVariant);

      if (window.gtag) {
        gtag('event', 'conversion', {
          'event_category': 'Header Banner Widget',
          'event_label': state.config.button_type,
          'variant': state.currentVariant.headline,
          'variant_style': state.currentVariant.style
        });
      }
    });
  }

  // ============================================
  // ROTATE HEADLINES
  // ============================================
  function startRotation(variants) {
    if (variants.length <= 1) return;
    
    state.rotationTimer = setInterval(() => {
      state.currentIndex = (state.currentIndex + 1) % variants.length;
      const nextVariant = variants[state.currentIndex];
      
      // Update state immediately
      state.currentVariant = nextVariant;
      trackImpression(nextVariant);
      
      // Fade transition
      const headlineEl = document.getElementById('banner-headline');
      
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
    console.log('\n📊 === HEADER BANNER ANALYTICS ===');
    console.log('Client:', CLIENT_ID);
    console.log('Business:', state.config?.business_name);
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
    console.log('🎯 Header Banner Widget initializing...');
    console.log('🆔 Client ID:', CLIENT_ID);
    
    state.config = await fetchClientConfig();
    
    if (!state.config) {
      console.error('❌ Could not load config. Widget will not display.');
      return;
    }
    
    const headlines = await getHeadlines(state.config);
    const variants = createVariantsFromHeadlines(headlines);
    
    const selectedVariant = await selectBestVariantAggregate(variants);
    
    renderBanner(selectedVariant);
    
    if (variants.length > 1) {
      console.log('🔄 Starting headline rotation');
      startRotation(variants);
    }
    
    console.log('✅ Header Banner ready!');
    console.log('💡 Type showBannerAnalytics() to view performance');
    
    window.showBannerAnalytics = showAnalytics;
    
    window.clearBannerData = function() {
      localStorage.removeItem('bannerPerformance_' + CLIENT_ID);
      sessionStorage.removeItem(`banner_headlines_${CLIENT_ID}_${window.location.pathname}`);
      console.log('✨ Banner data cleared!');
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
