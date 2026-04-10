/**
 * julie / script.js
 * ═══════════════════════════════════════════════════════════════
 *
 * Architecture: One IIFE (JuliePortfolio) wrapping six named
 * module objects, each with a single .init() entry point.
 * A single boot() function wires everything together.
 *
 * Modules
 * ───────
 *  Utils         — throttle, debounce, $, $$, getFocusable
 *  NavbarModule  — scroll solid state + scroll-spy active links
 *  MobileMenu    — open/close, focus trap, keyboard handling
 *  ScrollObs     — IntersectionObserver: reveals + skill bars
 *  FormModule    — field config, blur/input validation, submit
 *  FooterModule  — auto copyright year
 *
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

(function JuliePortfolio() {


  /* ─────────────────────────────────────────────────────────────
     MODULE: Utils
     Shared helpers consumed by every other module.
  ───────────────────────────────────────────────────────────── */
  const Utils = {

    /**
     * Throttle fn to fire at most once per limitMs.
     * Used on scroll to prevent layout thrashing.
     */
    throttle(fn, limitMs = 80) {
      let last = 0;
      return function (...args) {
        const now = Date.now();
        if (now - last >= limitMs) { last = now; fn.apply(this, args); }
      };
    },

    /**
     * Debounce fn to fire only after delayMs of silence.
     */
    debounce(fn, delayMs = 150) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delayMs);
      };
    },

    /** querySelector shorthand */
    $(sel, ctx = document) { return ctx.querySelector(sel); },

    /** querySelectorAll → Array */
    $$(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); },

    /**
     * All keyboard-focusable elements within a container.
     * Used by MobileMenu to implement focus trapping.
     */
    getFocusable(el) {
      return Utils.$$(
        'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        el
      );
    },
  };


  /* ─────────────────────────────────────────────────────────────
     MODULE: NavbarModule
     · Adds .nav--solid to .nav once user scrolls past 30px
     · Scroll-spy: updates .is-active + aria-current="page"
       on all [data-section] links (desktop + mobile)
       as the matching section crosses 40% viewport height
  ───────────────────────────────────────────────────────────── */
  const NavbarModule = {

    nav:      null,
    links:    [],
    sections: [],

    init() {
      this.nav      = Utils.$('.nav');
      this.links    = Utils.$$('[data-section]');
      this.sections = Utils.$$('section[id]');
      if (!this.nav) return;

      const tick = Utils.throttle(this._tick.bind(this), 80);
      window.addEventListener('scroll', tick, { passive: true });
      this._tick(); // set state immediately on load
    },

    _tick() {
      this._solidify();
      this._spy();
    },

    _solidify() {
      this.nav.classList.toggle('nav--solid', window.scrollY > 30);
    },

    /** Mark the section whose top edge is ≤40% from viewport top */
    _spy() {
      const mark = window.innerHeight * 0.4;
      let activeId = '';

      this.sections.forEach(s => {
        if (s.getBoundingClientRect().top <= mark) activeId = s.id;
      });

      this.links.forEach(a => {
        const hit = a.dataset.section === activeId;
        a.classList.toggle('is-active', hit);
        a.setAttribute('aria-current', hit ? 'page' : 'false');
      });
    },
  };


  /* ─────────────────────────────────────────────────────────────
     MODULE: MobileMenu
     · Toggle on hamburger click
     · Focus trap: Tab/Shift+Tab cycle within the panel
     · Escape to close
     · Outside click to close
     · aria-expanded, aria-hidden synced at all times
     · Body scroll locked while panel is open
     · Focus returns to hamburger on close
  ───────────────────────────────────────────────────────────── */
  const MobileMenu = {

    burger: null,
    panel:  null,
    links:  [],
    open:   false,

    init() {
      this.burger = Utils.$('.nav__burger');
      this.panel  = Utils.$('.mobile-nav');
      this.links  = Utils.$$('.mobile-nav__link');
      if (!this.burger || !this.panel) return;

      this.burger.addEventListener('click', () => this._toggle());
      this.links.forEach(l => l.addEventListener('click', () => this._close()));
      document.addEventListener('click',   e => this._outsideClick(e));
      document.addEventListener('keydown', e => this._keydown(e));
    },

    _toggle() { this.open ? this._close() : this._open(); },

    _open() {
      this.open = true;
      this.burger.setAttribute('aria-expanded', 'true');
      this.burger.setAttribute('aria-label', 'Close navigation');
      this.panel.classList.add('is-open');
      this.panel.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      const first = Utils.getFocusable(this.panel)[0];
      if (first) requestAnimationFrame(() => first.focus());
    },

    _close() {
      if (!this.open) return;
      this.open = false;
      this.burger.setAttribute('aria-expanded', 'false');
      this.burger.setAttribute('aria-label', 'Open navigation');
      this.panel.classList.remove('is-open');
      this.panel.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      this.burger.focus();
    },

    _outsideClick(e) {
      if (this.open && !this.panel.contains(e.target) && !this.burger.contains(e.target)) {
        this._close();
      }
    },

    _keydown(e) {
      if (!this.open) return;

      if (e.key === 'Escape') { e.preventDefault(); this._close(); return; }

      if (e.key === 'Tab') {
        const focusable = Utils.getFocusable(this.panel);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    },
  };


  /* ─────────────────────────────────────────────────────────────
     MODULE: ScrollObs
     · Assigns sequential data-delay indices to stagger siblings
     · Creates one IntersectionObserver for .reveal + .reveal-item
     · On intersect: adds .is-visible, fills skill bars, unobserves
     · If prefers-reduced-motion: skips observer entirely,
       shows everything immediately with no transition
  ───────────────────────────────────────────────────────────── */
  const ScrollObs = {

    obs: null,

    init() {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this._instant(); return;
      }
      this._stagger();
      this._createObs();
      this._observe();
    },

    /** Assign data-delay="N" to stagger siblings in list parents */
    _stagger() {
      Utils.$$('.skills__list, .projects__list').forEach(parent => {
        Utils.$$('.reveal-item', parent).forEach((child, i) => {
          child.dataset.delay = i;
        });
      });
    },

    _createObs() {
      this.obs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.classList.add('is-visible');
          // Animate skill bars contained within this element
          Utils.$$('.skill-bar__fill', el).forEach(fill => {
            fill.style.width = `${fill.dataset.w || 0}%`;
          });
          this.obs.unobserve(el); // fire once only
        });
      }, {
        threshold:  0.08,
        rootMargin: '0px 0px -40px 0px',
      });
    },

    _observe() {
      Utils.$$('.reveal, .reveal-item').forEach(el => this.obs.observe(el));
    },

    /** Reduced-motion / no-JS equivalent */
    _instant() {
      Utils.$$('.reveal, .reveal-item').forEach(el => el.classList.add('is-visible'));
      Utils.$$('.skill-bar__fill').forEach(fill => {
        fill.style.transition = 'none';
        fill.style.width = `${fill.dataset.w || 0}%`;
      });
    },
  };


  /* ─────────────────────────────────────────────────────────────
     MODULE: FormModule
     Validation strategy:
       · blur  → validate field, show error
       · input → if field was invalid, clear error immediately
       · submit → validate all; focus first invalid; show spinner;
                  call _simulateSubmit (swap for real fetch())
  ───────────────────────────────────────────────────────────── */
  const FormModule = {

    form:   null,
    btn:    null,
    result: null,

    /**
     * Field config map.
     * Key = input#id.
     * validate(value) → error string or '' (valid)
     */
    fields: {
      'input-name': {
        errId: 'err-name',
        validate(v) {
          if (!v.trim())         return 'Name is required.';
          if (v.trim().length < 2) return 'Please enter at least 2 characters.';
          return '';
        },
      },
      'input-email': {
        errId: 'err-email',
        validate(v) {
          if (!v.trim()) return 'Email is required.';
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()))
            return 'Please enter a valid email address.';
          return '';
        },
      },
      'input-message': {
        errId: 'err-message',
        validate(v) {
          if (!v.trim())           return 'Message is required.';
          if (v.trim().length < 10) return 'Please write at least 10 characters.';
          return '';
        },
      },
    },

    init() {
      this.form   = Utils.$('#contact-form');
      this.btn    = Utils.$('#form-btn');
      this.result = Utils.$('#form-result');
      if (!this.form) return;

      this._bindFields();
      this.form.addEventListener('submit', e => this._submit(e));
    },

    _bindFields() {
      Object.entries(this.fields).forEach(([id, cfg]) => {
        const el = Utils.$(`#${id}`);
        if (!el) return;
        el.addEventListener('blur',  () => this._setErr(id, cfg.validate(el.value)));
        el.addEventListener('input', () => { if (el.classList.contains('is-bad')) this._clrErr(id); });
      });
    },

    /** Set or clear error for one field */
    _setErr(id, msg) {
      const cfg = this.fields[id];
      const el  = Utils.$(`#${id}`);
      const err = Utils.$(`#${cfg.errId}`);
      if (!el || !err) return;
      err.textContent = msg;
      el.classList.toggle('is-bad', Boolean(msg));
      el.setAttribute('aria-invalid', String(Boolean(msg)));
    },

    _clrErr(id) { this._setErr(id, ''); },

    /** Validate all fields; return true if all pass */
    _validateAll() {
      let ok = true;
      Object.entries(this.fields).forEach(([id, cfg]) => {
        const el = Utils.$(`#${id}`);
        if (!el) return;
        const err = cfg.validate(el.value);
        this._setErr(id, err);
        if (err) ok = false;
      });
      return ok;
    },

    _submit(e) {
      e.preventDefault();
      if (!this._validateAll()) {
        const bad = Utils.$('.field__input.is-bad', this.form);
        if (bad) bad.focus();
        return;
      }
      this._setLoading();
      this._simulateSubmit();
    },

    _setLoading() {
      this.btn.disabled = true;
      const txt = Utils.$('.btn__text', this.btn);
      if (txt) txt.textContent = 'Sending…';
    },

    /**
     * Simulated async submit.
     * ─────────────────────────────────────────────
     * TO CONNECT A REAL BACKEND, replace this method:
     *
     *   async _simulateSubmit() {
     *     const data = new FormData(this.form);
     *     try {
     *       const res = await fetch('/api/contact', {
     *         method: 'POST', body: data,
     *       });
     *       if (!res.ok) throw new Error('Network error');
     *       this._showSuccess();
     *     } catch (err) {
     *       console.error(err);
     *       // show a global error banner here
     *     }
     *   }
     *
     * Services: Resend · Formspree · EmailJS · Netlify Forms
     * ─────────────────────────────────────────────
     */
    _simulateSubmit() {
      setTimeout(() => this._showSuccess(), 900);
    },

    _showSuccess() {
      this.form.reset();
      Object.keys(this.fields).forEach(id => this._clrErr(id));
      this.btn.style.display = 'none';
      this.result.removeAttribute('hidden');
      this.result.focus();
    },
  };


  /* ─────────────────────────────────────────────────────────────
     MODULE: FooterModule
     Injects current year into #yr.
  ───────────────────────────────────────────────────────────── */
  const FooterModule = {
    init() {
      const el = Utils.$('#yr');
      if (el) el.textContent = new Date().getFullYear();
    },
  };


  /* ─────────────────────────────────────────────────────────────
     SMOOTH SCROLL
     CSS handles it natively; this JS polyfill updates the URL
     hash without a jump and ensures cross-browser consistency.
  ───────────────────────────────────────────────────────────── */
  function initSmoothScroll() {
    Utils.$$('a[href^="#"]').forEach(a => {
      a.addEventListener('click', function (e) {
        const target = Utils.$(this.getAttribute('href'));
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, '', this.getAttribute('href'));
      });
    });
  }


  /* ─────────────────────────────────────────────────────────────
     BOOT — single entry point
  ───────────────────────────────────────────────────────────── */
  function boot() {
    NavbarModule.init();
    MobileMenu.init();
    ScrollObs.init();
    FormModule.init();
    FooterModule.init();
    initSmoothScroll();
  }

  // DOMContentLoaded guard
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot)
    : boot();

})();
