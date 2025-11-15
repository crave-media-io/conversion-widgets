(function() {
  'use strict';

  const SUPABASE = {
    url: 'https://dnsbirpaknvifkgbodqd.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuc2JpcnBha252aWZrZ2JvZHFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDI1MjUsImV4cCI6MjA3NTQ3ODUyNX0.0f_q15ZhmHI2gEpS53DyIeRnReF-KS4YYJ1PdetyYwQ'
  };

  const scriptTag = document.currentScript || document.querySelector('script[data-client-id]');
  const CLIENT_ID = scriptTag ? scriptTag.getAttribute('data-client-id') : 'test_client_123';

  // Check for stored test mode settings BEFORE defining state
  const storedTestMode = sessionStorage.getItem('AFTER_HOURS_TEST_MODE');
  const storedForceActive = sessionStorage.getItem('AFTER_HOURS_FORCE_ACTIVE') === 'true';
  const storedForceMobile = sessionStorage.getItem('AFTER_HOURS_FORCE_MOBILE') === 'true';

  const state = {
    config: null,
    isAfterHours: false,
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    forceActive: storedForceActive, // For testing
    forceMobile: storedForceMobile  // For testing
  };

  function getContrastColor(hexColor) {
    // Convert hex to RGB
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);

    // Calculate luminance (perceived brightness)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return black or white based on luminance
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  }

  // WCAG 2.1 AA compliant contrast ratio calculator
  function getRelativeLuminance(r, g, b) {
    // Normalize RGB values to 0-1
    const rsRGB = r / 255;
    const gsRGB = g / 255;
    const bsRGB = b / 255;

    // Apply gamma correction
    const rLinear = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const gLinear = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const bLinear = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

    // Calculate relative luminance
    return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
  }

  function hexToRGB(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  function getContrastRatio(color1, color2) {
    const rgb1 = hexToRGB(color1);
    const rgb2 = hexToRGB(color2);

    const lum1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
    const lum2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);

    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);

    return (lighter + 0.05) / (darker + 0.05);
  }

  function getAccessibleColor(textColor, backgroundColor) {
    // WCAG AA requires 4.5:1 contrast ratio for normal text
    const MIN_CONTRAST = 4.5;

    const currentContrast = getContrastRatio(textColor, backgroundColor);

    // If contrast is already good, return original color
    if (currentContrast >= MIN_CONTRAST) {
      return textColor;
    }

    // Try white or black as alternatives
    const whiteContrast = getContrastRatio('#FFFFFF', backgroundColor);
    const blackContrast = getContrastRatio('#000000', backgroundColor);

    // Return whichever has better contrast
    if (whiteContrast >= blackContrast) {
      return '#FFFFFF';
    } else {
      return '#000000';
    }
  }

  // Helper function to get the effective background color of an element
  function getEffectiveBackgroundColor(element) {
    let el = element;
    while (el && el !== document.body) {
      const bg = window.getComputedStyle(el).backgroundColor;
      // Check if background is not transparent
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        // Convert rgb() to hex
        const rgb = bg.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const toHex = (n) => {
            const hex = parseInt(n).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
          };
          return '#' + toHex(rgb[0]) + toHex(rgb[1]) + toHex(rgb[2]);
        }
        return bg;
      }
      el = el.parentElement;
    }
    // Default to white if no background found
    return '#FFFFFF';
  }

  // Helper function to get the appropriate link color (with auto-contrast if enabled)
  function getDesktopLinkColor(parentElement) {
    const baseColor = state.config.after_hours_desktop_link_color || '#667eea';
    const autoContrast = state.config.after_hours_auto_contrast || false;

    if (!autoContrast) {
      return baseColor;
    }

    // Auto-contrast is enabled - detect background and adjust if needed
    const bgColor = getEffectiveBackgroundColor(parentElement);
    const adjustedColor = getAccessibleColor(baseColor, bgColor);

    console.log(`🎨 Auto-contrast: bg=${bgColor}, base=${baseColor}, adjusted=${adjustedColor}`);

    return adjustedColor;
  }

  // Phone number regex patterns for detection
  const PHONE_PATTERNS = [
    /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, // (555) 555-5555, 555-555-5555, etc.
    /(\+?1[-.\s]?)?\d{3}[-.\s]\d{3}[-.\s]\d{4}/g, // 555-555-5555
    /(\+?1[-.\s]?)?\(?\d{3}\)?[\s]\d{3}[-.\s]\d{4}/g, // (555) 555-5555
    /\d{3}\.\d{3}\.\d{4}/g, // 555.555.5555
  ];

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

  async function fetchClientConfig() {
    try {
      console.log('🔍 Fetching after-hours config for client:', CLIENT_ID);

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
        console.log('✅ After-hours config loaded:', config.business_name);
        console.log('🎨 Color Debug Info:');
        console.log('   - Sidebar Panel Color (brand_color):', config.brand_color || 'NOT SET');
        console.log('   - Desktop Link Color (after_hours_desktop_link_color):', config.after_hours_desktop_link_color || 'NOT SET (will use default #667eea)');
        console.log('   - Are they different?', config.brand_color !== config.after_hours_desktop_link_color ? '✅ YES' : '❌ NO (same value)');
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

  function isAfterHours(config) {
    if (!config.after_hours_enabled) {
      return false;
    }

    // Get current time in client's timezone
    const now = new Date();
    const localTime = now.toLocaleTimeString('en-US', {
      hour12: false,
      timeZone: config.after_hours_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
    });

    const [hours, minutes] = localTime.split(':').map(Number);
    const currentMinutes = hours * 60 + minutes;

    // Parse start and end times
    const [startHour, startMin] = (config.after_hours_start || '17:00').split(':').map(Number);
    const [endHour, endMin] = (config.after_hours_end || '09:00').split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight periods (e.g., 5 PM to 9 AM)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }

  function createPopupHTML(config) {
    const fontFamily = config.custom_font_family || 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
    const buttonColor = config.after_hours_button_color || '#667eea';
    const buttonTextColor = config.after_hours_button_text_color || '#FFFFFF';
    const popupMessage = config.after_hours_message || "We're currently closed. Book online instead!";
    const allowCall = config.after_hours_allow_call !== false; // default true
    const popupIcon = config.after_hours_popup_icon || '🌙'; // Use custom icon or default to moon

    // Use show_branding from database config (set based on subscription plan)
    // Pro, Premium, and Unlimited plans have show_branding=false
    const showBranding = config.show_branding !== false;

    return `
      <div id="after-hours-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.3s ease-in-out;
        font-family: ${fontFamily};
      ">
        <style>
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(30px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        </style>

        <div style="
          background: white;
          border-radius: 16px;
          padding: 32px 24px;
          max-width: 90%;
          width: 400px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          text-align: center;
          font-family: inherit;
        ">
          <div style="
            font-size: 48px;
            margin-bottom: 20px;
          ">
            ${popupIcon}
          </div>

          <h2 style="
            margin: 0 0 16px 0;
            font-size: 24px;
            font-weight: 700;
            color: #333;
            font-family: inherit;
          ">
            After Hours
          </h2>

          <p style="
            margin: 0 0 28px 0;
            font-size: 16px;
            line-height: 1.5;
            color: #666;
            font-family: inherit;
          ">
            ${popupMessage}
          </p>

          <a href="${config.booking_url || '#'}"
             id="after-hours-book-btn"
             style="
            display: block;
            background: ${buttonColor};
            color: ${buttonTextColor};
            padding: 16px 28px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 16px;
            margin-bottom: ${allowCall ? '16px' : '0'};
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            font-family: inherit;
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0,0,0,0.2)'"
             onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'">
            📅 Book Online Now
          </a>

          ${allowCall ? `
            <button id="after-hours-call-anyway" style="
              background: none;
              border: none;
              color: #999;
              font-size: 14px;
              cursor: pointer;
              padding: 8px;
              text-decoration: underline;
              font-family: inherit;
            ">
              Call anyway
            </button>
          ` : `
            <button id="after-hours-close" style="
              background: none;
              border: none;
              color: #999;
              font-size: 14px;
              cursor: pointer;
              padding: 8px;
              font-family: inherit;
            ">
              Close
            </button>
          `}

          ${showBranding ? `
          <div style="
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid #eee;
            font-size: 10px;
            color: #999;
            font-family: inherit;
          ">
            <a href="https://cravemedia.io" target="_blank" rel="noopener noreferrer" style="color: #999; text-decoration: none;">
              Powered by cravemedia.io
            </a>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function showPopup(telUrl) {
    const existing = document.getElementById('after-hours-overlay');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.innerHTML = createPopupHTML(state.config);
    const popup = container.firstElementChild;
    document.body.appendChild(popup);

    // Track impression
    trackEvent('popup_shown');

    // Handle book button click
    const bookBtn = document.getElementById('after-hours-book-btn');
    if (bookBtn) {
      bookBtn.addEventListener('click', () => {
        trackEvent('booking_clicked');
        removePopup();
      });
    }

    // Handle "call anyway" or "close" button
    const callAnywayBtn = document.getElementById('after-hours-call-anyway');
    const closeBtn = document.getElementById('after-hours-close');

    if (callAnywayBtn) {
      callAnywayBtn.addEventListener('click', () => {
        trackEvent('call_anyway');
        removePopup();
        window.location.href = telUrl;
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        trackEvent('popup_dismissed');
        removePopup();
      });
    }

    // Close on overlay click
    popup.addEventListener('click', (e) => {
      if (e.target.id === 'after-hours-overlay') {
        trackEvent('popup_dismissed');
        removePopup();
      }
    });
  }

  function removePopup() {
    const popup = document.getElementById('after-hours-overlay');
    if (popup) {
      popup.style.animation = 'fadeIn 0.2s ease-in-out reverse';
      setTimeout(() => popup.remove(), 200);
    }
  }

  function shouldInterceptPhone(telHref) {
    const phoneMatchMode = state.config.after_hours_phone_match_mode || 'all';

    // If matching all phones, always intercept
    if (phoneMatchMode === 'all') {
      return true;
    }

    // If specific mode, check if this phone matches the target
    if (phoneMatchMode === 'specific') {
      const targetPhone = state.config.after_hours_target_phone;
      if (!targetPhone) {
        console.warn('⚠️ Specific phone match mode enabled but no target phone set. Defaulting to match all.');
        return true;
      }

      // Extract phone number from tel: link
      const linkPhone = telHref.replace('tel:', '').trim();
      const normalizedLink = normalizePhoneNumber(linkPhone);
      const normalizedTarget = normalizePhoneNumber(targetPhone);

      const matches = normalizedLink === normalizedTarget;
      if (!matches) {
        console.log(`📞 Skipping phone ${linkPhone} (doesn't match target ${targetPhone})`);
      }
      return matches;
    }

    return true;
  }

  function interceptTelLinks() {
    // Intercept tel: link clicks based on matching mode
    document.addEventListener('click', (e) => {
      if (!state.isAfterHours || !state.isMobile) return;

      // Find the closest anchor tag
      let target = e.target;
      while (target && target.tagName !== 'A') {
        target = target.parentElement;
      }

      if (target && target.href && target.href.startsWith('tel:')) {
        // Check if we should intercept this specific phone number
        if (shouldInterceptPhone(target.href)) {
          e.preventDefault();
          e.stopPropagation();
          showPopup(target.href);
        }
      }
    }, true); // Use capture phase to intercept before other handlers

    const matchMode = state.config.after_hours_phone_match_mode || 'all';
    if (matchMode === 'specific') {
      console.log('📞 Mobile tel: link interception active (specific number mode)');
      console.log('   Target phone:', state.config.after_hours_target_phone);
    } else {
      console.log('📞 Mobile tel: link interception active (all numbers)');
    }
  }

  function normalizePhoneNumber(phone) {
    // Remove all non-digit characters
    return phone.replace(/\D/g, '');
  }

  function isPhoneNumber(text) {
    const normalized = normalizePhoneNumber(text);
    // Check if it's 10 or 11 digits (US phone format)
    return normalized.length === 10 || (normalized.length === 11 && normalized[0] === '1');
  }

  function replacePhoneNumbers() {
    if (state.isMobile) return; // Only run on desktop

    const phoneMatchMode = state.config.after_hours_phone_match_mode || 'all';
    if (phoneMatchMode === 'specific') {
      console.log('🔍 Scanning page for phone numbers (specific number mode)...');
      console.log('   Target phone:', state.config.after_hours_target_phone);
    } else {
      console.log('🔍 Scanning page for phone numbers (all numbers)...');
    }

    // Parse vanity numbers from config if provided
    const vanityNumbers = [];
    if (state.config.after_hours_vanity_numbers && state.config.after_hours_vanity_numbers.trim()) {
      const rawVanities = state.config.after_hours_vanity_numbers.split(',');
      rawVanities.forEach(v => {
        const trimmed = v.trim();
        if (trimmed) {
          vanityNumbers.push(trimmed);
        }
      });
      if (vanityNumbers.length > 0) {
        console.log('📱 Vanity numbers to detect:', vanityNumbers);
      }
    }

    const treeWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip script, style, and already processed nodes
          if (node.parentElement.tagName === 'SCRIPT' ||
              node.parentElement.tagName === 'STYLE' ||
              node.parentElement.tagName === 'NOSCRIPT' ||
              node.parentElement.hasAttribute('data-after-hours-processed') ||
              node.parentElement.closest('[data-after-hours-processed]')) {
            return NodeFilter.FILTER_REJECT;
          }

          // Check if text contains a phone-like pattern
          const text = node.textContent.trim();
          if (text.length < 10) return NodeFilter.FILTER_REJECT;

          for (const pattern of PHONE_PATTERNS) {
            // Reset regex lastIndex
            pattern.lastIndex = 0;
            if (pattern.test(text)) {
              return NodeFilter.FILTER_ACCEPT;
            }
          }

          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodesToReplace = [];
    let node;
    while (node = treeWalker.nextNode()) {
      nodesToReplace.push(node);
    }

    let replacementCount = 0;
    const afterHoursLabel = state.config.after_hours_label || 'After Hours';
    const bookingText = state.config.after_hours_booking_text || 'Book Online';

    nodesToReplace.forEach(textNode => {
      const text = textNode.textContent;
      let modifiedText = text;
      const replacedPhones = new Set(); // Track replaced numbers to avoid duplicates

      // Create a combined pattern to find all phone numbers
      const combinedPattern = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
      const matches = [...text.matchAll(combinedPattern)];

      if (matches.length === 0) return;

      // Process matches in reverse order to maintain string positions
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        const phoneText = match[0];

        // Skip if already replaced or not a valid phone
        if (replacedPhones.has(phoneText) || !isPhoneNumber(phoneText)) {
          continue;
        }

        replacedPhones.add(phoneText);
        const normalizedPhone = normalizePhoneNumber(phoneText);

        // Check if we should replace this phone number based on matching mode
        const phoneMatchMode = state.config.after_hours_phone_match_mode || 'all';
        if (phoneMatchMode === 'specific') {
          const targetPhone = state.config.after_hours_target_phone;
          if (targetPhone) {
            const normalizedTarget = normalizePhoneNumber(targetPhone);
            if (normalizedPhone !== normalizedTarget) {
              // Skip this phone - doesn't match target
              continue;
            }
          }
        }

        // Get flag colors and settings
        const flagBgColor = state.config.after_hours_flag_bg || '#ffc107';
        const flagTextColor = state.config.after_hours_flag_text || '#333';
        const flagIcon = state.config.after_hours_icon || '🌙';
        const flagPosition = state.config.after_hours_flag_position || 'above'; // 'above', 'left', 'right'
        const afterHoursMode = state.config.after_hours_mode || 'block';

        // Mobile-only mode: Skip desktop phone replacement entirely
        if (afterHoursMode === 'mobile_only') {
          continue; // Skip this phone number on desktop
        }

        // Determine layout based on mode and position
        let replacement;

        if (afterHoursMode === 'flag_only') {
          // Flag-only mode: Keep phone number functional, just add flag
          if (flagPosition === 'above') {
            replacement = `<span style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; vertical-align: middle;" data-after-hours-processed="true">
  <span style="display: inline-block;
               padding: 3px 10px;
               background: ${flagBgColor};
               color: ${flagTextColor};
               font-size: 11px;
               border-radius: 4px;
               font-weight: 600;
               white-space: nowrap;
               line-height: 1.2;">
    ${flagIcon} ${afterHoursLabel}
  </span>
  <span style="display: inline-block; line-height: 1.2;">${phoneText}</span>
</span>`;
          } else {
            // Left or right position (horizontal layout)
            const flexDirection = flagPosition === 'left' ? 'row' : 'row-reverse';
            replacement = `<span style="display: inline-flex; flex-direction: ${flexDirection}; align-items: center; gap: 8px; vertical-align: middle;" data-after-hours-processed="true">
  <span style="display: inline-block;
               padding: 3px 10px;
               background: ${flagBgColor};
               color: ${flagTextColor};
               font-size: 11px;
               border-radius: 4px;
               font-weight: 600;
               white-space: nowrap;
               line-height: 1.2;">
    ${flagIcon} ${afterHoursLabel}
  </span>
  <span style="display: inline-block; line-height: 1.2;">${phoneText}</span>
</span>`;
          }
        } else {
          // Block mode: Replace phone with booking link (current default behavior)
          if (flagPosition === 'above') {
            replacement = `<span style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; vertical-align: middle;" data-after-hours-processed="true">
  <span style="display: inline-block;
               padding: 3px 10px;
               background: ${flagBgColor};
               color: ${flagTextColor};
               font-size: 11px;
               border-radius: 4px;
               font-weight: 600;
               white-space: nowrap;
               line-height: 1.2;">
    ${flagIcon} ${afterHoursLabel}
  </span>
  <a href="${state.config.booking_url || '#'}"
     style="color: ${state.config.after_hours_desktop_link_color || '#667eea'} !important;
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
            border-bottom: 2px solid ${state.config.after_hours_desktop_link_color || '#667eea'} !important;
            line-height: 1.2;"
     data-after-hours-book="true"
     onclick="window.afterHoursTrackEvent && window.afterHoursTrackEvent('phone_replacement_clicked')">
    ${bookingText}
  </a>
</span>`;
          } else {
            // Left or right position (horizontal layout)
            const flexDirection = flagPosition === 'left' ? 'row' : 'row-reverse';
            replacement = `<span style="display: inline-flex; flex-direction: ${flexDirection}; align-items: center; gap: 8px; vertical-align: middle;" data-after-hours-processed="true">
  <span style="display: inline-block;
               padding: 3px 10px;
               background: ${flagBgColor};
               color: ${flagTextColor};
               font-size: 11px;
               border-radius: 4px;
               font-weight: 600;
               white-space: nowrap;
               line-height: 1.2;">
    ${flagIcon} ${afterHoursLabel}
  </span>
  <a href="${state.config.booking_url || '#'}"
     style="color: ${state.config.after_hours_desktop_link_color || '#667eea'} !important;
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
            border-bottom: 2px solid ${state.config.after_hours_desktop_link_color || '#667eea'} !important;
            line-height: 1.2;"
     data-after-hours-book="true"
     onclick="window.afterHoursTrackEvent && window.afterHoursTrackEvent('phone_replacement_clicked')">
    ${bookingText}
  </a>
</span>`;
          }
        }

        // Replace in the modified text
        const startPos = match.index;
        const endPos = startPos + phoneText.length;
        modifiedText = modifiedText.substring(0, startPos) + replacement + modifiedText.substring(endPos);

        replacementCount++;
      }

      if (replacedPhones.size > 0) {
        const span = document.createElement('span');
        span.innerHTML = modifiedText;
        span.setAttribute('data-after-hours-processed', 'true');
        textNode.parentElement.replaceChild(span, textNode);

        // Apply auto-contrast if enabled
        if (state.config.after_hours_auto_contrast) {
          const bookingLinks = span.querySelectorAll('a[data-after-hours-book]');
          bookingLinks.forEach(link => {
            const adjustedColor = getDesktopLinkColor(link.parentElement);
            link.style.color = adjustedColor + ' !important';
            link.style.borderBottomColor = adjustedColor + ' !important';
          });
        }
      }
    });

    if (replacementCount > 0) {
      console.log(`✅ Replaced ${replacementCount} phone number(s)`);
      trackEvent('phone_numbers_replaced', { count: replacementCount });
    } else {
      console.log('ℹ️ No phone numbers found on page');
    }

    // Replace vanity numbers if configured
    if (vanityNumbers.length > 0) {
      replaceVanityNumbers(vanityNumbers);
    }
  }

  function replaceVanityNumbers(vanityNumbers) {
    console.log('🔍 Scanning page for vanity numbers...');
    console.log('🎨 Vanity Link Color Check:');
    console.log('   - Will use color:', state.config.after_hours_desktop_link_color || '#667eea');
    console.log('   - Sidebar panel color is:', state.config.brand_color);

    const treeWalker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip script, style, and already processed nodes
          if (node.parentElement.tagName === 'SCRIPT' ||
              node.parentElement.tagName === 'STYLE' ||
              node.parentElement.tagName === 'NOSCRIPT' ||
              node.parentElement.hasAttribute('data-after-hours-processed') ||
              node.parentElement.closest('[data-after-hours-processed]')) {
            return NodeFilter.FILTER_REJECT;
          }

          // Check if text contains any vanity number
          const text = node.textContent;
          for (const vanity of vanityNumbers) {
            if (text.indexOf(vanity) !== -1) {
              return NodeFilter.FILTER_ACCEPT;
            }
          }

          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodesToReplace = [];
    let node;
    while (node = treeWalker.nextNode()) {
      nodesToReplace.push(node);
    }

    let replacementCount = 0;
    const afterHoursLabel = state.config.after_hours_label || 'After Hours';
    const bookingText = state.config.after_hours_booking_text || 'Book Online';
    const flagBgColor = state.config.after_hours_flag_bg || '#ffc107';
    const flagTextColor = state.config.after_hours_flag_text || '#333';
    const flagIcon = state.config.after_hours_icon || '🌙';
    const flagPosition = state.config.after_hours_flag_position || 'above';
    const afterHoursMode = state.config.after_hours_mode || 'block';

    // Create replacement HTML template based on mode
    let replacementTemplate;

    if (afterHoursMode === 'flag_only') {
      // Flag-only mode: Keep vanity number functional, just add flag
      if (flagPosition === 'above') {
        replacementTemplate = `<span style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; vertical-align: middle;" data-after-hours-processed="true">
  <span style="display: inline-block;
               padding: 3px 10px;
               background: ${flagBgColor};
               color: ${flagTextColor};
               font-size: 11px;
               border-radius: 4px;
               font-weight: 600;
               white-space: nowrap;
               line-height: 1.2;">
    ${flagIcon} ${afterHoursLabel}
  </span>
  <span style="display: inline-block; line-height: 1.2;">VANITY_NUMBER</span>
</span>`;
      } else {
        const flexDirection = flagPosition === 'left' ? 'row' : 'row-reverse';
        replacementTemplate = `<span style="display: inline-flex; flex-direction: ${flexDirection}; align-items: center; gap: 8px; vertical-align: middle;" data-after-hours-processed="true">
  <span style="display: inline-block;
               padding: 3px 10px;
               background: ${flagBgColor};
               color: ${flagTextColor};
               font-size: 11px;
               border-radius: 4px;
               font-weight: 600;
               white-space: nowrap;
               line-height: 1.2;">
    ${flagIcon} ${afterHoursLabel}
  </span>
  <span style="display: inline-block; line-height: 1.2;">VANITY_NUMBER</span>
</span>`;
      }
    } else {
      // Block mode: Replace vanity number with booking link
      if (flagPosition === 'above') {
        replacementTemplate = `<span style="display: inline-flex; flex-direction: column; align-items: center; gap: 4px; vertical-align: middle;" data-after-hours-processed="true">
  <span style="display: inline-block;
               padding: 3px 10px;
               background: ${flagBgColor};
               color: ${flagTextColor};
               font-size: 11px;
               border-radius: 4px;
               font-weight: 600;
               white-space: nowrap;
               line-height: 1.2;">
    ${flagIcon} ${afterHoursLabel}
  </span>
  <a href="${state.config.booking_url || '#'}"
     style="color: ${state.config.after_hours_desktop_link_color || '#667eea'} !important;
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
            border-bottom: 2px solid ${state.config.after_hours_desktop_link_color || '#667eea'} !important;
            line-height: 1.2;"
     data-after-hours-book="true"
     onclick="window.afterHoursTrackEvent && window.afterHoursTrackEvent('vanity_replacement_clicked')">
    ${bookingText}
  </a>
</span>`;
      } else {
        const flexDirection = flagPosition === 'left' ? 'row' : 'row-reverse';
        replacementTemplate = `<span style="display: inline-flex; flex-direction: ${flexDirection}; align-items: center; gap: 8px; vertical-align: middle;" data-after-hours-processed="true">
  <span style="display: inline-block;
               padding: 3px 10px;
               background: ${flagBgColor};
               color: ${flagTextColor};
               font-size: 11px;
               border-radius: 4px;
               font-weight: 600;
               white-space: nowrap;
               line-height: 1.2;">
    ${flagIcon} ${afterHoursLabel}
  </span>
  <a href="${state.config.booking_url || '#'}"
     style="color: ${state.config.after_hours_desktop_link_color || '#667eea'} !important;
            font-weight: 600;
            font-size: 14px;
            text-decoration: none;
            border-bottom: 2px solid ${state.config.after_hours_desktop_link_color || '#667eea'} !important;
            line-height: 1.2;"
     data-after-hours-book="true"
     onclick="window.afterHoursTrackEvent && window.afterHoursTrackEvent('vanity_replacement_clicked')">
    ${bookingText}
  </a>
</span>`;
      }
    }

    nodesToReplace.forEach(textNode => {
      let text = textNode.textContent;
      let modifiedText = text;
      let hasReplacements = false;

      // Replace each vanity number found in the text
      vanityNumbers.forEach(vanity => {
        const escapedVanity = vanity.replace(/[.*+?^${}()|\\\[\]]/g, '\\$&');
        const vanityRegex = new RegExp(escapedVanity, 'g');

        if (vanityRegex.test(modifiedText)) {
          // Replace VANITY_NUMBER placeholder with actual vanity number
          const finalReplacement = replacementTemplate.replace('VANITY_NUMBER', vanity);
          modifiedText = modifiedText.replace(vanityRegex, finalReplacement);
          hasReplacements = true;
          replacementCount++;
        }
      });

      if (hasReplacements) {
        const span = document.createElement('span');
        span.innerHTML = modifiedText;
        span.setAttribute('data-after-hours-processed', 'true');
        textNode.parentElement.replaceChild(span, textNode);

        // Apply auto-contrast if enabled
        if (state.config.after_hours_auto_contrast) {
          const bookingLinks = span.querySelectorAll('a[data-after-hours-book]');
          bookingLinks.forEach(link => {
            const adjustedColor = getDesktopLinkColor(link.parentElement);
            link.style.color = adjustedColor + ' !important';
            link.style.borderBottomColor = adjustedColor + ' !important';
          });
        }
      }
    });

    if (replacementCount > 0) {
      console.log(`✅ Replaced ${replacementCount} vanity number(s)`);
      trackEvent('vanity_numbers_replaced', { count: replacementCount, vanities: vanityNumbers });
    } else {
      console.log('ℹ️ No vanity numbers found on page');
    }
  }

  async function trackEvent(eventType, metadata = {}) {
    try {
      await fetch(SUPABASE.url + '/rest/v1/after_hours_events', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE.key,
          'Authorization': 'Bearer ' + SUPABASE.key,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          event_type: eventType,
          is_mobile: state.isMobile,
          page_url: window.location.pathname,
          metadata: metadata
        })
      });
      console.log('📊 Event tracked:', eventType);
    } catch (error) {
      console.error('Error tracking event:', error);
    }
  }

  // Expose tracking function globally for inline onclick handlers
  window.afterHoursTrackEvent = trackEvent;

  // Expose state for debugging
  window.afterHoursDebugState = state;

  async function init() {
    console.log('🚀 After-Hours Widget initializing...');
    console.log('📦 Widget Version: 2025-11-15 Auto-Contrast Debug');
    console.log('🆔 Client ID:', CLIENT_ID);
    console.log('📱 Device:', state.isMobile ? 'Mobile' : 'Desktop');

    state.config = await fetchClientConfig();

    if (!state.config) {
      console.error('❌ Could not load config. Widget will not activate.');
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
    const isEnabled = await checkIfWidgetEnabled('after_hours', CLIENT_ID);
    if (!isEnabled) {
      console.log('🚫 Widget blocked: Not enabled for this client');
      return;
    }

    if (!state.config.after_hours_enabled) {
      console.log('ℹ️ After-hours widget is not enabled for this client');
      return;
    }

    // Log test mode if active
    if (state.forceActive || state.forceMobile) {
      console.log('🧪 TEST MODE ACTIVE - forceActive:', state.forceActive, 'forceMobile:', state.forceMobile);
    }

    state.isAfterHours = state.forceActive || isAfterHours(state.config);
    const effectiveIsMobile = state.forceMobile || state.isMobile;

    if (!state.isAfterHours) {
      console.log('ℹ️ Currently within business hours - widget inactive');
      console.log('💡 To test, use: activateAfterHoursTestMode(true) or activateAfterHoursTestMode(true, true) for mobile');
      return;
    }

    console.log('🌙 After-hours mode ACTIVE');

    if (effectiveIsMobile) {
      // Mobile: Intercept tel: links
      interceptTelLinks();
    } else {
      // Desktop: Replace/flag phone numbers
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', replacePhoneNumbers);
      } else {
        replacePhoneNumbers();
      }

      // Also watch for dynamic content
      const observer = new MutationObserver((mutations) => {
        let shouldReplace = false;
        mutations.forEach(mutation => {
          if (mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === Node.ELEMENT_NODE &&
                  !node.hasAttribute('data-after-hours-processed')) {
                shouldReplace = true;
              }
            });
          }
        });

        if (shouldReplace) {
          setTimeout(replacePhoneNumbers, 100);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      console.log('👀 Watching for dynamically added content');
    }

    console.log('✅ After-hours widget ready!');

    // Helper function for testing
    window.testAfterHoursPopup = function() {
      const effectiveIsMobile = state.forceMobile || state.isMobile;
      if (effectiveIsMobile) {
        console.log('📱 Testing mobile popup...');
        showPopup('tel:5555555555');
      } else {
        console.log('⚠️ Popup is only shown on mobile. On desktop, phone numbers are replaced.');
        console.log('💡 Activate mobile test mode with: activateAfterHoursTestMode(true, true)');
      }
    };

    window.showAfterHoursStatus = function() {
      const effectiveIsMobile = state.forceMobile || state.isMobile;
      console.log('After-Hours Widget Status:', {
        enabled: state.config.after_hours_enabled,
        isAfterHours: state.isAfterHours,
        isMobile: state.isMobile,
        effectiveIsMobile: effectiveIsMobile,
        timezone: state.config.after_hours_timezone,
        startTime: state.config.after_hours_start,
        endTime: state.config.after_hours_end,
        allowCallOnMobile: state.config.after_hours_allow_call,
        phoneMatchMode: state.config.after_hours_phone_match_mode || 'all',
        targetPhone: state.config.after_hours_target_phone || 'none',
        forceActive: state.forceActive,
        forceMobile: state.forceMobile,
        testModeActive: state.forceActive || state.forceMobile
      });
    };
  }

  // Global test mode activation function (uses sessionStorage to persist across reload)
  window.activateAfterHoursTestMode = function(forceActive, forceMobile) {
    const active = forceActive !== false; // default true
    const mobile = forceMobile || false;

    sessionStorage.setItem('AFTER_HOURS_TEST_MODE', 'true');
    sessionStorage.setItem('AFTER_HOURS_FORCE_ACTIVE', String(active));
    sessionStorage.setItem('AFTER_HOURS_FORCE_MOBILE', String(mobile));

    console.log('🧪 Test mode configured. Reloading page...');
    console.log('   Force Active:', active);
    console.log('   Force Mobile:', mobile);

    setTimeout(() => window.location.reload(), 500);
  };

  window.deactivateAfterHoursTestMode = function() {
    sessionStorage.removeItem('AFTER_HOURS_TEST_MODE');
    sessionStorage.removeItem('AFTER_HOURS_FORCE_ACTIVE');
    sessionStorage.removeItem('AFTER_HOURS_FORCE_MOBILE');

    console.log('🧪 Test mode deactivated. Reloading page...');
    setTimeout(() => window.location.reload(), 500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

