(function() {
  'use strict';
  
  // ============================================
  // CONFIGURATION
  // ============================================
  const SUPABASE = {
    url: 'https://dnsbirpaknvifkgbodqd.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuc2JpcnBha252aWZrZ2JvZHFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDI1MjUsImV4cCI6MjA3NTQ3ODUyNX0.0f_q15ZhmHI2gEpS53DyIeRnReF-KS4YYJ1PdetyYwQ'
  };

  const VERCEL_API = 'https://conversion-widget-bvlot9viq-zacs-projects-da5d5e52.vercel.app';

  // Get client ID from script tag
  const scriptTag = document.currentScript || document.querySelector('script[data-client-id]');
  const CLIENT_ID = scriptTag ? scriptTag.getAttribute('data-client-id') : 'test_client_123';

  // ============================================
  // STATE MANAGEMENT
  // ============================================
  const state = {
    config: null,
    currentVariant: null,
    currentIndex: 0,
    isDismissed: false,
    rotationTimer: null,
    isVisible: false,
    headlines: null
  };

  // ============================================
  // FETCH CONFIG FROM SUPABASE
  // ============================================
  async function fetchClientConfig() {
    try {
      console.log('🔍 Fetching config for client:', CLIENT_ID);
      
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
        console.log('✅ Config loaded:', data[0].business_name);
        return data[0];
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
  // FETCH/GENERATE HEADLINES
  // ============================================
  async function getHeadlines(config) {
    // Check cache first
    const cacheKey = `headlines_${CLIENT_ID}_${window.location.pathname}`;
    const cached = sessionStorage.getItem(cacheKey);
    
    if (cached) {
      console.log('📦 Using cached headlines');
      return JSON.parse(cached);
    }

    // Load page-specific headlines from Supabase
    try {
      console.log('📋 Loading headlines for page:', window.location.pathname);
      
      const response = await fetch(
        `${SUPABASE.url}/rest/v1/page_headlines?client_id=eq.${CLIENT_ID}&page_url=eq.${encodeURIComponent(window.location.pathname)}`,
        {
          headers: {
            'apikey': SUPABASE.key,
            'Authorization': `Bearer ${SUPABASE.key}`
          }
        }
      );
      
      const data = await response.json();
      
      if (data && data.length > 0 && data[0].headlines) {
        console.log('✅ Page-specific headlines loaded:', data[0].headlines);
        
        // Cache for this session
        sessionStorage.setItem(cacheKey, JSON.stringify(data[0].headlines));
        
        return data[0].headlines;
      } else {
        console.log('📝 No page-specific headlines, using defaults');
        return config.headlines || getDefaultHeadlines();
      }
    } catch (error) {
      console.error('❌ Error loading headlines:', error);
      console.log('📝 Falling back to default headlines');
      return config.headlines || getDefaultHeadlines();
    }
  }

  function getDefaultHeadlines() {
    return [
      "Need help? We're here for you!",
      "Get started today!",
      "Contact us now!"
    ];
  }

  // ============================================
  // LOCAL STORAGE HELPERS
  // ============================================
  function getPerformanceData() {
    try {
      const data = localStorage.getItem('sidebarPerformance_' + CLIENT_ID);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  }

  function savePerformanceData(data) {
    try {
      localStorage.setItem('sidebarPerformance_' + CLIENT_ID, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving performance:', e);
    }
  }

  function isDismissedToday() {
    try {
      const dismissed = localStorage.getItem('sidebarDismissed_' + CLIENT_ID);
      if (!dismissed) return false;
      
      const dismissedDate = new Date(dismissed);
      const today = new Date();
      
      return dismissedDate.toDateString() === today.toDateString();
    } catch (e) {
      return false;
    }
  }

  function setDismissed() {
    try {
      localStorage.setItem('sidebarDismissed_' + CLIENT_ID, new Date().toISOString());
    } catch (e) {
      console.error('Error saving dismissed state:', e);
    }
  }

  // ============================================
  // PERFORMANCE TRACKING (LOCAL + SUPABASE)
  // ============================================
  async function sendToSupabase(eventType, variant) {
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
          page_url: window.location.pathname,
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
        dismissals: 0,
        lastShown: null
      };
    }
    
    perfData[key].impressions++;
    perfData[key].lastShown = new Date().toISOString();
    
    savePerformanceData(perfData);
    console.log('📊 Sidebar impression:', key);
    
    // Send to Supabase for dashboard analytics
    sendToSupabase('impression', variant);
  }

  function trackConversion(variant) {
    const perfData = getPerformanceData();
    const key = variant.headline;
    
    if (perfData[key]) {
      perfData[key].conversions++;
      savePerformanceData(perfData);
      
      const rate = ((perfData[key].conversions / perfData[key].impressions) * 100).toFixed(1);
      console.log('🎯 SIDEBAR CONVERSION!', {
        headline: key,
        conversions: perfData[key].conversions,
        impressions: perfData[key].impressions,
        rate: rate + '%'
      });
      
      // Send to Supabase for dashboard analytics
      sendToSupabase('conversion', variant);
    }
  }

  function trackDismissal(variant) {
    const perfData = getPerformanceData();
    const key = variant.headline;
    
    if (perfData[key]) {
      perfData[key].dismissals++;
      savePerformanceData(perfData);
      console.log('❌ Sidebar dismissed:', key);
    }
  }

  function selectBestVariant(variants) {
    const perfData = getPerformanceData();
    const epsilon = 0.2;
    
    if (Math.random() < epsilon || Object.keys(perfData).length === 0) {
      const randomVariant = variants[Math.floor(Math.random() * variants.length)];
      console.log('🎲 Sidebar exploring:', randomVariant.style);
      return randomVariant;
    }
    
    let bestVariant = variants[0];
    let bestRate = 0;
    
    variants.forEach(variant => {
      const data = perfData[variant.headline];
      if (data && data.impressions > 0) {
        const rate = data.conversions / data.impressions;
        if (rate > bestRate) {
          bestRate = rate;
          bestVariant = variant;
        }
      }
    });
    
    console.log('🏆 Sidebar best performer:', bestVariant.style);
    return bestVariant;
  }

  async function selectBestVariantAggregate(variants) {
    const epsilon = 0.2;
    
    // Random exploration 20% of the time
    if (Math.random() < epsilon) {
      const randomVariant = variants[Math.floor(Math.random() * variants.length)];
      console.log('🎲 Exploring (random):', randomVariant.headline);
      return randomVariant;
    }
    
    // Fetch aggregate stats from Supabase
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
      
      // Find best performing headline from aggregate data
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
      
      // Find matching variant
      const bestVariant = variants.find(v => v.headline === bestHeadline);
      
      if (bestVariant) {
        console.log('🏆 Global winner (' + bestRate + '%):', bestHeadline);
        return bestVariant;
      }
      
      return variants[0];
      
    } catch (error) {
      console.error('Error fetching aggregate stats:', error);
      // Fallback to local selection
      return selectBestVariant(variants);
    }
  }

  function showAnalytics() {
    const perfData = getPerformanceData();
    console.log('\n📊 === SIDEBAR PERFORMANCE ANALYTICS ===');
    console.log('Client:', CLIENT_ID);
    console.log('Business:', state.config?.business_name);
    console.log('LLM Generation:', state.config?.generate_headlines ? 'Enabled' : 'Disabled');
    console.log('\nMessage Performance:');
    
    let totalImpressions = 0;
    let totalConversions = 0;
    let totalDismissals = 0;
    
    const sortedData = Object.values(perfData).sort((a, b) => {
      const rateA = a.impressions > 0 ? a.conversions / a.impressions : 0;
      const rateB = b.impressions > 0 ? b.conversions / b.impressions : 0;
      return rateB - rateA;
    });
    
    sortedData.forEach(data => {
      const cvRate = data.impressions > 0 
        ? ((data.conversions / data.impressions) * 100).toFixed(1) + '%'
        : '0%';
      const dismissRate = data.impressions > 0
        ? ((data.dismissals / data.impressions) * 100).toFixed(1) + '%'
        : '0%';
      
      console.log(`\n${data.style}:`);
      console.log(`  "${data.headline}"`);
      console.log(`  Impressions: ${data.impressions}`);
      console.log(`  Conversions: ${data.conversions} (${cvRate})`);
      console.log(`  Dismissals: ${data.dismissals} (${dismissRate})`);
      
      totalImpressions += data.impressions;
      totalConversions += data.conversions;
      totalDismissals += data.dismissals;
    });
    
    const overallRate = totalImpressions > 0
      ? ((totalConversions / totalImpressions) * 100).toFixed(1) + '%'
      : '0%';
    
    console.log('\n=== OVERALL ===');
    console.log('Total Impressions:', totalImpressions);
    console.log('Total Conversions:', totalConversions);
    console.log('Total Dismissals:', totalDismissals);
    console.log('Conversion Rate:', overallRate);
    console.log('================\n');
  }

  // ============================================
  // CREATE MESSAGE VARIANTS FROM HEADLINES
  // ============================================
  function createVariantsFromHeadlines(headlines) {
    const styles = ['helpful', 'urgency', 'social-proof', 'risk-reversal', 'discount'];
    
    return headlines.map((headline, index) => ({
      headline: headline,
      message: "We're here to help you get started. Reach out today!",
      style: styles[index % styles.length]
    }));
  }

  // ============================================
  // CREATE SIDEBAR HTML
  // ============================================
  function createSidebarHTML(variant, config) {
    const buttonText = config.button_type === 'call' 
      ? `📞 Call Now`
      : '📅 Book Online';
    
    const buttonLink = config.button_type === 'call'
      ? `tel:${config.phone_number.replace(/\D/g, '')}`
      : config.booking_url;

    const sidePosition = (config.position === 'left')
      ? `left: -380px; right: auto;`
      : `right: -380px; left: auto;`;

    const perfData = getPerformanceData()[variant.headline] || { impressions: 0, conversions: 0 };
    const rate = perfData.impressions > 0 
      ? ((perfData.conversions / perfData.impressions) * 100).toFixed(1) + '%'
      : '0%';

    return `
      <div id="vertical-sidebar" style="
        position: fixed;
        top: 0;
        bottom: 0;
        ${sidePosition}
        width: 380px;
        height: 100vh;
        background: ${config.brand_color ? `linear-gradient(180deg, ${config.brand_color} 0%, ${adjustColor(config.brand_color, -20)} 100%)` : 'linear-gradient(180deg, #667eea 0%, #764ba2 100%)'};
        color: #ffffff;
        box-shadow: ${(config.position === 'left') ? '4px' : '-4px'} 0 30px rgba(0, 0, 0, 0.4);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transition: ${(config.position === 'left') ? 'left' : 'right'} 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
      ">
        <style>
          @keyframes fadeMessage {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
          }
          #vertical-sidebar::-webkit-scrollbar {
            width: 8px;
          }
          #vertical-sidebar::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
          }
          #vertical-sidebar::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.3);
            border-radius: 4px;
          }
          #vertical-sidebar::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.5);
          }
          @media (max-width: 768px) {
            #vertical-sidebar {
              width: 85vw !important;
            }
          }
          @media (max-width: 480px) {
            #vertical-sidebar {
              width: 100vw !important;
            }
          }
        </style>
        
        <button id="sidebar-dismiss" style="
          position: absolute;
          top: 20px;
          ${(config.position === 'left') ? 'right: 20px;' : 'left: 20px;'}
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: #ffffff;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 24px;
          line-height: 1;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          z-index: 10;
        " onmouseover="this.style.background='rgba(255,255,255,0.4)'; this.style.transform='rotate(90deg)'" 
           onmouseout="this.style.background='rgba(255,255,255,0.2)'; this.style.transform='rotate(0deg)'">
          ×
        </button>
        
        <div style="
          padding: 60px 40px;
          max-width: 100%;
          width: 100%;
          box-sizing: border-box;
        ">
          <div style="text-align: center; margin-bottom: 40px;">
            <div style="
              font-size: 60px;
              margin-bottom: 20px;
              opacity: 0.9;
            ">
              💬
            </div>
            
            <h2 id="sidebar-headline" style="
              margin: 0 0 20px 0;
              font-size: 32px;
              font-weight: 700;
              line-height: 1.2;
            ">
              ${variant.headline}
            </h2>
            
            <p id="sidebar-message" style="
              margin: 0 0 40px 0;
              font-size: 18px;
              line-height: 1.6;
              opacity: 0.95;
            ">
              ${variant.message}
            </p>
          </div>
          
          <a href="${buttonLink}" 
             id="sidebar-cta-btn"
             style="
            display: block;
            background: white;
            color: ${config.brand_color || '#667eea'};
            padding: 20px 32px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 700;
            font-size: 18px;
            text-align: center;
            transition: all 0.3s;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
            margin-bottom: 20px;
          " onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.4)'"
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 20px rgba(0,0,0,0.3)'">
            ${buttonText}
          </a>
          
          ${config.button_type === 'call' ? `
            <p style="
              text-align: center;
              font-size: 22px;
              font-weight: 600;
              margin: 0 0 40px 0;
              opacity: 0.95;
            ">
              ${config.phone_number}
            </p>
          ` : ''}
          
          <div style="
            text-align: center;
            padding-top: 40px;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
          ">
            <p style="
              margin: 0;
              font-size: 12px;
              opacity: 0.6;
            ">
              ${config.business_name}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================
  // HELPER: Adjust color brightness
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
  // SHOW/HIDE SIDEBAR
  // ============================================
  function showSidebar(variant) {
    if (state.isVisible) return;
    
    trackImpression(variant);
    state.currentVariant = variant;
    state.isVisible = true;
    
    const existing = document.getElementById('vertical-sidebar');
    if (existing) existing.remove();
    
    const container = document.createElement('div');
    container.innerHTML = createSidebarHTML(variant, state.config);
    const sidebar = container.firstElementChild;
    document.body.appendChild(sidebar);
    
    // Slide in
    setTimeout(() => {
      const sideProperty = (state.config.position === 'left') ? 'left' : 'right';
      sidebar.style[sideProperty] = '0';
    }, 100);
    
    // Add event listeners
    const ctaBtn = document.getElementById('sidebar-cta-btn');
    const dismissBtn = document.getElementById('sidebar-dismiss');
    
    // Track conversions
    ctaBtn.addEventListener('click', () => {
      trackConversion(state.currentVariant);

      if (window.gtag) {
        gtag('event', 'conversion', {
          'event_category': 'Sidebar Widget',
          'event_label': state.config.button_type,
          'variant': state.currentVariant.headline,
          'variant_style': state.currentVariant.style
        });
      }
    });
    
    // Handle dismissal
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        trackDismissal(state.currentVariant);
        hideSidebar();
      });
    }
  }

  function hideSidebar() {
    const sidebar = document.getElementById('vertical-sidebar');
    if (!sidebar) return;
    
    const sideProperty = (state.config.position === 'left') ? 'left' : 'right';
    sidebar.style[sideProperty] = '-380px';
    
    setTimeout(() => {
      sidebar.remove();
      state.isVisible = false;
      state.isDismissed = true;
      setDismissed();
      
      if (state.rotationTimer) {
        clearInterval(state.rotationTimer);
      }
    }, 500);
  }

  // ============================================
  // ROTATE MESSAGES
  // ============================================
  function startRotation(variants) {
    if (variants.length <= 1) return;
    
    state.rotationTimer = setInterval(() => {
      if (state.isDismissed || !state.isVisible) {
        clearInterval(state.rotationTimer);
        return;
      }
      
      state.currentIndex = (state.currentIndex + 1) % variants.length;
      const nextVariant = variants[state.currentIndex];
      
      // Update state IMMEDIATELY before animation
      state.currentVariant = nextVariant;
      trackImpression(nextVariant);
      
      // Fade transition
      const headlineEl = document.getElementById('sidebar-headline');
      const messageEl = document.getElementById('sidebar-message');
      
      if (headlineEl && messageEl) {
        headlineEl.style.animation = 'fadeMessage 0.6s ease-in-out';
        messageEl.style.animation = 'fadeMessage 0.6s ease-in-out';
        
        setTimeout(() => {
          headlineEl.textContent = nextVariant.headline;
          messageEl.textContent = nextVariant.message;
        }, 300);
      }
    }, 10000); // 10 seconds
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  async function init() {
    console.log('🚀 AI-Powered Sidebar initializing...');
    console.log('🆔 Client ID:', CLIENT_ID);
    
    // Fetch config from Supabase
    state.config = await fetchClientConfig();
    
    if (!state.config) {
      console.error('❌ Could not load config. Widget will not display.');
      return;
    }
    
    // Check if dismissed today
    if (isDismissedToday()) {
      console.log('⏸️ Sidebar was dismissed today, skipping');
      return;
    }
    
    // Get headlines (LLM or static)
    const headlines = await getHeadlines(state.config);
    const variants = createVariantsFromHeadlines(headlines);
    
    // Use aggregate stats from Supabase to select best performer
    // Falls back to local stats if Supabase unavailable
    const selectedVariant = await selectBestVariantAggregate(variants);
    
    // Auto-show after delay
    setTimeout(() => {
      showSidebar(selectedVariant);
      
      if (variants.length > 1) {
        console.log('🔄 Starting message rotation');
        startRotation(variants);
      }
    }, 3000);
    
    console.log('✅ Sidebar ready!');
    console.log('💡 Type showSidebarAnalytics() to view performance');
    
    // Global functions
    window.showSidebarAnalytics = showAnalytics;
    
    window.clearSidebarData = function() {
      localStorage.removeItem('sidebarPerformance_' + CLIENT_ID);
      localStorage.removeItem('sidebarDismissed_' + CLIENT_ID);
      sessionStorage.removeItem(`headlines_${CLIENT_ID}_${window.location.pathname}`);
      console.log('✨ Sidebar data cleared!');
      location.reload();
    };
    
    window.toggleSidebar = function() {
      if (state.isVisible) {
        hideSidebar();
      } else {
        showSidebar(selectedVariant);
      }
    };
  }

  // Make clearSidebarData always available
  window.clearSidebarData = function() {
    localStorage.removeItem('sidebarPerformance_' + CLIENT_ID);
    localStorage.removeItem('sidebarDismissed_' + CLIENT_ID);
    sessionStorage.removeItem(`headlines_${CLIENT_ID}_${window.location.pathname}`);
    console.log('✨ Sidebar data cleared!');
    location.reload();
  };

  // ============================================
  // START
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
