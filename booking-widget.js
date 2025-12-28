(function() {
  'use strict';

  const VERCEL_API = 'https://conversion-widget.vercel.app';

  // Get client ID from script tag
  const scriptTag = document.currentScript || document.querySelector('script[data-client-id][src*="booking-widget"]');
  const CLIENT_ID = scriptTag ? scriptTag.getAttribute('data-client-id') : null;
  const CONTAINER_ID = scriptTag ? scriptTag.getAttribute('data-container') : 'crave-booking-widget';

  // Widget state
  const state = {
    config: null,
    services: [],
    headlines: [],
    currentHeadline: null,
    selectedDate: null,
    selectedTime: null,
    availableSlots: [],
    sessionId: generateSessionId(),
    attribution: null
  };

  // Generate unique session ID
  function generateSessionId() {
    return 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  // Capture attribution data on load
  function captureAttribution() {
    const params = new URLSearchParams(window.location.search);
    state.attribution = {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_term: params.get('utm_term'),
      utm_content: params.get('utm_content'),
      referrer_url: document.referrer || null,
      landing_page: window.location.href,
      gclid: params.get('gclid'),
      fbclid: params.get('fbclid')
    };
  }

  // Initialize widget
  async function init() {
    if (!CLIENT_ID) {
      console.error('[Booking Widget] No client_id provided');
      return;
    }

    console.log('[Booking Widget] Initializing for client:', CLIENT_ID);

    // Capture attribution
    captureAttribution();

    // Fetch configuration
    try {
      const response = await fetch(`${VERCEL_API}/api/booking/config-public?client_id=${CLIENT_ID}`);

      if (!response.ok) {
        if (response.status === 404) {
          console.log('[Booking Widget] Widget not enabled for this client');
          return;
        }
        throw new Error('Failed to fetch config');
      }

      const data = await response.json();
      state.config = data.config;
      state.services = data.services || [];
      state.headlines = data.headlines || [];

      // Select random headline for A/B testing
      if (state.headlines.length > 0) {
        state.currentHeadline = state.headlines[Math.floor(Math.random() * state.headlines.length)];
        trackImpression();
      }

      // Render widget
      renderWidget();

    } catch (error) {
      console.error('[Booking Widget] Initialization error:', error);
    }
  }

  // Track headline impression
  async function trackImpression() {
    if (!state.currentHeadline) return;

    try {
      await fetch(`${VERCEL_API}/api/booking/impression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          headline_id: state.currentHeadline.id,
          session_id: state.sessionId,
          page_url: window.location.pathname
        })
      });
    } catch (error) {
      console.warn('[Booking Widget] Failed to track impression:', error);
    }
  }

  // Render the widget
  function renderWidget() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) {
      console.error('[Booking Widget] Container not found:', CONTAINER_ID);
      return;
    }

    const config = state.config;
    const styles = generateStyles(config);

    container.innerHTML = `
      <style>${styles}</style>
      <div class="crv-booking-widget">
        <div class="crv-booking-header">
          ${state.currentHeadline ? `
            <h2 class="crv-booking-headline">${escapeHtml(state.currentHeadline.headline_text)}</h2>
            ${state.currentHeadline.subheadline_text ? `<p class="crv-booking-subheadline">${escapeHtml(state.currentHeadline.subheadline_text)}</p>` : ''}
          ` : `
            <h2 class="crv-booking-headline">${escapeHtml(config.widget_title)}</h2>
          `}
        </div>

        <form id="crv-booking-form" class="crv-booking-form">
          ${config.show_service_selector && state.services.length > 0 ? `
            <div class="crv-form-group">
              <label for="crv-service">Service</label>
              <select id="crv-service" name="service" class="crv-input">
                <option value="">Select a service...</option>
                ${state.services.map(s => `
                  <option value="${s.id}" data-duration="${s.duration_minutes}">${escapeHtml(s.service_name)}</option>
                `).join('')}
              </select>
            </div>
          ` : ''}

          <div class="crv-form-group">
            <label for="crv-date">Preferred Date *</label>
            <input type="date" id="crv-date" name="date" class="crv-input" required
              min="${getMinDate(config)}"
              max="${getMaxDate(config)}">
          </div>

          ${config.show_time_slots ? `
            <div class="crv-form-group">
              <label for="crv-time">Preferred Time</label>
              <select id="crv-time" name="time" class="crv-input" disabled>
                <option value="">Select a date first...</option>
              </select>
            </div>
          ` : ''}

          <div class="crv-form-row">
            <div class="crv-form-group">
              <label for="crv-name">Your Name *</label>
              <input type="text" id="crv-name" name="name" class="crv-input" required placeholder="John Smith">
            </div>
          </div>

          <div class="crv-form-row">
            <div class="crv-form-group crv-half">
              <label for="crv-email">Email *</label>
              <input type="email" id="crv-email" name="email" class="crv-input" required placeholder="john@example.com">
            </div>
            <div class="crv-form-group crv-half">
              <label for="crv-phone">Phone *</label>
              <input type="tel" id="crv-phone" name="phone" class="crv-input" required placeholder="(555) 123-4567">
            </div>
          </div>

          ${config.show_address_field ? `
            <div class="crv-form-group">
              <label for="crv-address">Address</label>
              <input type="text" id="crv-address" name="address" class="crv-input" placeholder="123 Main St, City, State">
            </div>
          ` : ''}

          <div class="crv-form-group">
            <label for="crv-notes">${escapeHtml(config.notes_field_label)}</label>
            <textarea id="crv-notes" name="notes" class="crv-input crv-textarea" rows="3" placeholder="Any details about your request..."></textarea>
          </div>

          <button type="submit" class="crv-submit-btn">
            <span class="crv-btn-text">${escapeHtml(config.button_text)}</span>
            <span class="crv-btn-loading" style="display: none;">
              <svg class="crv-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="60" stroke-dashoffset="20"></circle></svg>
              Submitting...
            </span>
          </button>

          <div id="crv-form-message" class="crv-message" style="display: none;"></div>
        </form>
      </div>
    `;

    // Attach event listeners
    attachEventListeners();
  }

  // Generate CSS styles
  function generateStyles(config) {
    const primaryColor = config.primary_color || '#667eea';
    const bgColor = config.background_color || '#ffffff';
    const textColor = config.text_color || '#333333';
    const fontFamily = config.font_family || 'inherit';

    return `
      .crv-booking-widget {
        font-family: ${fontFamily}, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: ${bgColor};
        color: ${textColor};
        padding: 24px;
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        max-width: 500px;
        margin: 0 auto;
      }

      .crv-booking-header {
        text-align: center;
        margin-bottom: 24px;
      }

      .crv-booking-headline {
        font-size: 24px;
        font-weight: 700;
        margin: 0 0 8px 0;
        color: ${textColor};
      }

      .crv-booking-subheadline {
        font-size: 16px;
        color: ${textColor};
        opacity: 0.8;
        margin: 0;
      }

      .crv-booking-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .crv-form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .crv-form-row {
        display: flex;
        gap: 16px;
      }

      .crv-form-group.crv-half {
        flex: 1;
      }

      .crv-form-group label {
        font-size: 14px;
        font-weight: 600;
        color: ${textColor};
      }

      .crv-input {
        width: 100%;
        padding: 12px 14px;
        font-size: 15px;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        background: #fff;
        color: ${textColor};
        transition: border-color 0.2s, box-shadow 0.2s;
        font-family: inherit;
        box-sizing: border-box;
      }

      .crv-input:focus {
        outline: none;
        border-color: ${primaryColor};
        box-shadow: 0 0 0 3px ${primaryColor}22;
      }

      .crv-input:disabled {
        background: #f5f5f5;
        cursor: not-allowed;
      }

      .crv-textarea {
        resize: vertical;
        min-height: 80px;
      }

      .crv-submit-btn {
        width: 100%;
        padding: 14px 24px;
        font-size: 16px;
        font-weight: 600;
        color: #fff;
        background: ${primaryColor};
        border: none;
        border-radius: 8px;
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 8px;
      }

      .crv-submit-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px ${primaryColor}44;
      }

      .crv-submit-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
      }

      .crv-spinner {
        width: 20px;
        height: 20px;
        animation: crv-spin 1s linear infinite;
      }

      @keyframes crv-spin {
        to { transform: rotate(360deg); }
      }

      .crv-message {
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 14px;
        text-align: center;
        margin-top: 8px;
      }

      .crv-message.success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
      }

      .crv-message.error {
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
      }

      .crv-success-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }

      .crv-booking-ref {
        font-family: monospace;
        background: #f0f0f0;
        padding: 8px 16px;
        border-radius: 4px;
        display: inline-block;
        margin-top: 8px;
      }

      @media (max-width: 480px) {
        .crv-booking-widget {
          padding: 16px;
        }

        .crv-form-row {
          flex-direction: column;
          gap: 16px;
        }

        .crv-booking-headline {
          font-size: 20px;
        }
      }
    `;
  }

  // Attach event listeners
  function attachEventListeners() {
    const form = document.getElementById('crv-booking-form');
    const dateInput = document.getElementById('crv-date');
    const serviceSelect = document.getElementById('crv-service');

    // Date change - fetch available slots
    if (dateInput) {
      dateInput.addEventListener('change', async (e) => {
        const date = e.target.value;
        if (date) {
          await fetchAvailability(date);
        }
      });
    }

    // Service change - refetch availability with new duration
    if (serviceSelect) {
      serviceSelect.addEventListener('change', async () => {
        const date = dateInput?.value;
        if (date) {
          await fetchAvailability(date);
        }
      });
    }

    // Form submit
    if (form) {
      form.addEventListener('submit', handleSubmit);
    }
  }

  // Fetch available time slots
  async function fetchAvailability(date) {
    const timeSelect = document.getElementById('crv-time');
    const serviceSelect = document.getElementById('crv-service');

    if (!timeSelect) return;

    timeSelect.innerHTML = '<option value="">Loading...</option>';
    timeSelect.disabled = true;

    try {
      const serviceId = serviceSelect?.value || null;

      const response = await fetch(`${VERCEL_API}/api/booking/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          date: date,
          service_id: serviceId
        })
      });

      const data = await response.json();

      if (data.available && data.slots.length > 0) {
        state.availableSlots = data.slots;
        timeSelect.innerHTML = `
          <option value="">Select a time...</option>
          ${data.slots.map(slot => `<option value="${slot}">${formatTime(slot)}</option>`).join('')}
        `;
        timeSelect.disabled = false;
      } else {
        timeSelect.innerHTML = `<option value="">${data.reason || 'No times available'}</option>`;
        timeSelect.disabled = true;
      }

    } catch (error) {
      console.error('[Booking Widget] Availability error:', error);
      timeSelect.innerHTML = '<option value="">Error loading times</option>';
    }
  }

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const submitBtn = form.querySelector('.crv-submit-btn');
    const btnText = submitBtn.querySelector('.crv-btn-text');
    const btnLoading = submitBtn.querySelector('.crv-btn-loading');
    const messageEl = document.getElementById('crv-form-message');

    // Show loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'flex';
    messageEl.style.display = 'none';

    try {
      // Gather form data
      const formData = new FormData(form);
      const serviceSelect = document.getElementById('crv-service');
      const selectedService = serviceSelect?.options[serviceSelect.selectedIndex];

      const bookingData = {
        client_id: CLIENT_ID,
        customer_name: formData.get('name'),
        customer_email: formData.get('email'),
        customer_phone: formData.get('phone'),
        customer_address: formData.get('address') || null,
        service_id: formData.get('service') || null,
        service_name: selectedService?.text || null,
        requested_date: formData.get('date'),
        requested_time: formData.get('time') || null,
        notes: formData.get('notes') || null,
        // Attribution
        headline_id: state.currentHeadline?.id || null,
        headline_text: state.currentHeadline?.headline_text || null,
        ...state.attribution
      };

      const response = await fetch(`${VERCEL_API}/api/booking/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Show success message
        showSuccess(result);
      } else {
        throw new Error(result.error || 'Booking failed');
      }

    } catch (error) {
      console.error('[Booking Widget] Submit error:', error);
      messageEl.className = 'crv-message error';
      messageEl.innerHTML = error.message || 'Something went wrong. Please try again.';
      messageEl.style.display = 'block';

      // Reset button
      submitBtn.disabled = false;
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
    }
  }

  // Show success state
  function showSuccess(result) {
    const container = document.getElementById(CONTAINER_ID);
    const config = state.config;

    container.innerHTML = `
      <style>
        .crv-success {
          text-align: center;
          padding: 40px 24px;
          background: ${config.background_color || '#ffffff'};
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          max-width: 500px;
          margin: 0 auto;
          font-family: ${config.font_family || 'inherit'}, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .crv-success-icon {
          font-size: 64px;
          margin-bottom: 16px;
        }

        .crv-success h2 {
          color: ${config.text_color || '#333'};
          font-size: 24px;
          margin: 0 0 12px 0;
        }

        .crv-success p {
          color: ${config.text_color || '#333'};
          opacity: 0.8;
          font-size: 16px;
          margin: 0 0 20px 0;
        }

        .crv-booking-ref {
          font-family: monospace;
          background: #f0f0f0;
          padding: 12px 20px;
          border-radius: 6px;
          display: inline-block;
          font-size: 18px;
          font-weight: 600;
          color: ${config.primary_color || '#667eea'};
        }
      </style>
      <div class="crv-success">
        <div class="crv-success-icon">&#x2705;</div>
        <h2>Booking Submitted!</h2>
        <p>${escapeHtml(result.message || config.success_message)}</p>
        <div class="crv-booking-ref">${escapeHtml(result.booking_reference)}</div>
      </div>
    `;

    // Handle redirect if configured
    if (config.redirect_url) {
      setTimeout(() => {
        window.location.href = config.redirect_url;
      }, 3000);
    }
  }

  // Helper functions
  function getMinDate(config) {
    const today = new Date();
    if (!config.same_day_enabled) {
      today.setDate(today.getDate() + 1);
    }
    return today.toISOString().split('T')[0];
  }

  function getMaxDate(config) {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + (config.max_advance_days || 60));
    return maxDate.toISOString().split('T')[0];
  }

  function formatTime(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
