/*!
 * Let's Talk BCN - page behaviour (replaces the LeBari template script).
 * Needs jquery.js, owl.js and wow.js before it; meant to be loaded with `defer`.
 */
(function ($, window, document) {
	'use strict';

	var root = document.documentElement;
	var reducedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
	var supportsSmoothScroll = 'scrollBehavior' in root.style;

	// Labels for controls created or enhanced here, chosen by <html lang>.
	var STRINGS = {
		es: { openMenu: 'Abrir menú', closeMenu: 'Cerrar menú', toTop: 'Volver arriba', languages: 'Cambiar idioma', prev: 'Opinión anterior', next: 'Opinión siguiente' },
		ca: { openMenu: 'Obre el menú', closeMenu: 'Tanca el menú', toTop: 'Torna a dalt', languages: "Canvia l'idioma", prev: 'Opinió anterior', next: 'Opinió següent' },
		en: { openMenu: 'Open menu', closeMenu: 'Close menu', toTop: 'Back to top', languages: 'Change language', prev: 'Previous testimonial', next: 'Next testimonial' }
	};
	var text = STRINGS[(root.getAttribute('lang') || '').slice(0, 2).toLowerCase()] || STRINGS.en;

	var CHEVRON_SVG = '<svg class="icon-svg" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';


	/* Helpers
	   ------------------------------------------------------------------ */

	function prefersReducedMotion() {
		return !!(reducedMotionQuery && reducedMotionQuery.matches);
	}

	function isActivateKey(event) {
		return event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar' || event.which === 13 || event.which === 32;
	}

	function isEscapeKey(event) {
		return event.key === 'Escape' || event.key === 'Esc' || event.which === 27;
	}

	function relatedTarget(event) {
		return event.relatedTarget || (event.originalEvent && event.originalEvent.relatedTarget) || null;
	}

	function isVisible(el) {
		return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
	}

	// Button semantics + Enter/Space for controls that aren't a <button>
	// (current markup, Owl arrows). Native buttons only get a missing label.
	function asButton($elements, label) {
		$elements.each(function () {
			var el = this;
			if (el.tagName !== 'BUTTON') {
				if (!el.hasAttribute('role')) { el.setAttribute('role', 'button'); }
				if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); }
				$(el).on('keydown', function (event) {
					if (isActivateKey(event)) {
						event.preventDefault();
						$(el).trigger('click');
					}
				});
			}
			if (label && !el.hasAttribute('aria-label')) { el.setAttribute('aria-label', label); }
		});
	}

	function focusElement(el) {
		try { el.focus({ preventScroll: true }); } catch (err) { el.focus(); }
	}

	// Elements whose visibility is still transitioning in can't take focus
	// yet; retry for a few frames.
	function focusWhenReady(el, attemptsLeft) {
		if (!el) { return; }
		if (attemptsLeft === undefined) { attemptsLeft = 20; }
		focusElement(el);
		if (document.activeElement !== el && attemptsLeft > 0) {
			window.requestAnimationFrame(function () { focusWhenReady(el, attemptsLeft - 1); });
		}
	}

	// Focus a scroll target; non-focusable ones get a temporary tabindex="-1"
	// (Bootstrap's reboot removes the outline for it).
	function moveFocusTo(el) {
		if (!$(el).is('a[href], button, input, select, textarea, [tabindex]')) {
			el.setAttribute('tabindex', '-1');
			$(el).one('blur', function () { el.removeAttribute('tabindex'); });
		}
		focusElement(el);
	}

	// Smooth scroll (instant with reduced motion), then move focus there.
	// The pinned-header offset comes from scroll-padding-top (initHeader).
	function scrollToElement(el) {
		var isPageTop = el === root || el === document.body;
		if (supportsSmoothScroll && !prefersReducedMotion()) {
			if (isPageTop) {
				window.scrollTo({ top: 0, behavior: 'smooth' });
			} else {
				el.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}
		} else {
			var previous = root.style.scrollBehavior;
			root.style.scrollBehavior = 'auto'; // beat any CSS scroll-behavior: smooth
			if (isPageTop) { window.scrollTo(0, 0); } else { el.scrollIntoView(true); }
			root.style.scrollBehavior = previous;
		}
		moveFocusTo(isPageTop ? document.body : el);
	}

	// rAF-throttled width changes (mobile URL-bar height changes are ignored).
	var widthCallbacks = [];
	var lastWidth = window.innerWidth;
	var resizeQueued = false;

	function onWidthChange(callback) {
		widthCallbacks.push(callback);
	}

	window.addEventListener('resize', function () {
		if (resizeQueued) { return; }
		resizeQueued = true;
		window.requestAnimationFrame(function () {
			resizeQueued = false;
			if (window.innerWidth === lastWidth) { return; }
			lastWidth = window.innerWidth;
			for (var i = 0; i < widthCallbacks.length; i++) { widthCallbacks[i](); }
		});
	}, { passive: true });


	/* Fixed header + scroll-to-top button
	   ------------------------------------------------------------------ */

	function initHeader() {
		var header = document.querySelector('.main-header');
		if (!header) { return; }
		var $header = $(header);
		var $scrollTop = $('.scroll-to-top');
		var threshold = 0;
		var isFixed = null;
		var queued = false;

		// All layout reads live here (init, load, fonts, width change), never in the scroll path.
		function measure() {
			var wasFixed = $header.hasClass('fixed-header');
			$header.removeClass('fixed-header');
			threshold = $header.height();
			// Apply .fixed-header for a moment (nothing paints in between) to see
			// whether it pins the header (fixed on desktop, sticky at 768–1023px) and how tall it is then.
			$header.addClass('fixed-header');
			var pinnedPosition = window.getComputedStyle(header).position;
			var pinnedHeight = (pinnedPosition === 'fixed' || pinnedPosition === 'sticky') ? header.offsetHeight : 0;
			$header.toggleClass('fixed-header', wasFixed);
			// Keeps anchor targets and focused elements out from under the pinned header.
			root.style.scrollPaddingTop = pinnedHeight ? pinnedHeight + 'px' : '';
		}

		function update() {
			queued = false;
			var fixed = (window.pageYOffset || root.scrollTop) >= threshold;
			if (fixed === isFixed) { return; }
			isFixed = fixed;
			$header.toggleClass('fixed-header', fixed);
			$scrollTop.stop(true, true)[fixed ? 'fadeIn' : 'fadeOut'](300);
		}

		function remeasure() {
			measure();
			update();
		}

		remeasure();
		window.addEventListener('scroll', function () {
			if (queued) { return; }
			queued = true;
			window.requestAnimationFrame(update);
		}, { passive: true });
		onWidthChange(remeasure);
		if (document.readyState !== 'complete') { $(window).one('load', remeasure); }
		if (document.fonts && document.fonts.ready) { document.fonts.ready.then(remeasure); }
	}


	/* Desktop language submenu
	   Hover is pure CSS. This adds click/Enter toggling (li.is-open, which the
	   CSS must also show), Escape, close on focus-out / outside click, and
	   keeps aria-expanded in sync.
	   ------------------------------------------------------------------ */

	function initDesktopDropdown() {
		$('.main-header .main-menu .navigation li.dropdown').each(function () {
			var $item = $(this);
			var $link = $item.children('a').first();
			var hovered = false;
			var pinned = false;
			if (!$item.children('ul').length) { return; }

			function sync() {
				$item.toggleClass('is-open', pinned);
				$link.attr('aria-expanded', String(pinned || hovered));
			}

			function close() {
				if (pinned) { pinned = false; sync(); }
			}

			$link.attr('aria-expanded', 'false').on('click', function (event) {
				event.preventDefault(); // href is "#" (or "javascript:")
				pinned = !pinned;
				sync();
			});

			$item.on('mouseenter', function () { hovered = true; sync(); })
				.on('mouseleave', function () { hovered = false; sync(); })
				.on('focusout', function (event) {
					var next = relatedTarget(event);
					if (!next || !$.contains(this, next)) { close(); }
				})
				.on('keydown', function (event) {
					if (pinned && isEscapeKey(event)) {
						close();
						$link[0].focus();
					}
				});

			$(document).on('click', function (event) {
				if (pinned && !$.contains($item[0], event.target)) { close(); }
			});
		});
	}


	/* Mobile menu
	   ------------------------------------------------------------------ */

	function initMobileMenu() {
		var $menu = $('.mobile-menu').first();
		var $source = $('.main-header .nav-outer .main-menu').first();
		var $toggler = $('.mobile-nav-toggler').first();
		if (!$menu.length || !$source.length || !$toggler.length) { return null; }
		var $closeBtn = $menu.find('.close-btn').first();
		var $body = $(document.body);

		// Copy the desktop nav into the panel.
		var $copy = $('<div>').append($source.children().clone());
		$copy.find('.navbar-header').remove();          // Bootstrap toggler: never visible, inert here
		$copy.find('[id]').removeAttr('id');             // no duplicate IDs
		$copy.find('.collapse').removeClass('collapse'); // stay visible without the #navbarSupportedContent CSS rule
		$copy.find('li.dropdown').each(function () {
			var $item = $(this);
			if (!$item.children('ul').length) { return; }
			var $btn = $('<div class="dropdown-btn" role="button" tabindex="0" aria-expanded="false"></div>')
				.attr('aria-label', text.languages)
				.html(CHEVRON_SVG);
			// Right after the link so the tab order is link, toggle, submenu items.
			$item.children('a').first().attr('aria-expanded', 'false').after($btn);
		});
		$menu.find('.menu-outer').append($copy.children());

		// Submenu: the chevron button and the parent link both toggle it.
		function toggleSubmenu($item) {
			var $btn = $item.children('.dropdown-btn');
			var open = $btn.attr('aria-expanded') !== 'true';
			$btn.toggleClass('open', open).attr('aria-expanded', String(open));
			$item.children('a').first().attr('aria-expanded', String(open));
			$item.children('ul').stop(true, true)[open ? 'slideDown' : 'slideUp'](500);
		}

		$menu.on('click', 'li.dropdown > .dropdown-btn', function () {
			toggleSubmenu($(this).parent());
		}).on('keydown', 'li.dropdown > .dropdown-btn', function (event) {
			if (isActivateKey(event)) {
				event.preventDefault();
				toggleSubmenu($(this).parent());
			}
		}).on('click', 'li.dropdown > a', function (event) {
			event.preventDefault();
			toggleSubmenu($(this).parent());
		});

		// Open / close.
		if (!$menu.attr('id')) { $menu.attr('id', 'mobile-menu'); }
		asButton($toggler, text.openMenu);
		asButton($closeBtn, text.closeMenu);
		$toggler.attr({ 'aria-controls': $menu.attr('id'), 'aria-expanded': 'false' });

		function isOpen() {
			return $body.hasClass('mobile-menu-visible');
		}

		function focusableItems() {
			return $menu.find('a[href], button:not([disabled]), [tabindex="0"]').filter(function () {
				return isVisible(this);
			});
		}

		function onKeydown(event) {
			if (isEscapeKey(event)) {
				event.preventDefault();
				close(true);
				return;
			}
			if (event.key !== 'Tab' && event.which !== 9) { return; }
			// Keep Tab inside the open panel.
			var $items = focusableItems();
			var first = $items[0];
			var last = $items[$items.length - 1];
			var active = document.activeElement;
			if (!first) { return; }
			if (!$.contains($menu[0], active)) {
				event.preventDefault();
				first.focus();
			} else if (event.shiftKey && active === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && active === last) {
				event.preventDefault();
				first.focus();
			}
		}

		function open() {
			if (isOpen()) { return; }
			$body.addClass('mobile-menu-visible');
			$toggler.attr('aria-expanded', 'true');
			$(document).on('keydown.mobileMenu', onKeydown);
			focusWhenReady($closeBtn[0] || focusableItems()[0]);
		}

		// restoreFocus is false when focus goes somewhere else (a section).
		function close(restoreFocus) {
			if (!isOpen()) { return; }
			$body.removeClass('mobile-menu-visible');
			$toggler.attr('aria-expanded', 'false');
			$(document).off('keydown.mobileMenu');
			if (restoreFocus && isVisible($toggler[0])) { $toggler[0].focus(); }
		}

		$toggler.on('click', open);
		$menu.on('click', '.menu-backdrop, .close-btn', function () { close(true); });

		// The panel only exists for small screens; close it if the viewport grows.
		onWidthChange(function () {
			if (isOpen() && !isVisible($toggler[0])) { close(false); }
		});

		return { element: $menu[0], close: close };
	}


	/* In-page anchors and .scroll-to-target
	   ------------------------------------------------------------------ */

	function initScrollLinks(mobileMenu) {
		$(document).on('click', 'a[href^="#"]', function (event) {
			var hash = this.getAttribute('href');
			var target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
			if (!target) { return; } // incl. "#" (submenu parent, handled above)
			event.preventDefault();
			if (mobileMenu && $.contains(mobileMenu.element, this)) { mobileMenu.close(false); }
			scrollToElement(target);
		});

		asButton($('.scroll-to-top'), text.toTop);

		$(document).on('click', '.scroll-to-target', function (event) {
			var target;
			try { target = document.querySelector(this.getAttribute('data-target') || 'html'); } catch (err) { target = null; }
			if (!target) { return; }
			event.preventDefault();
			scrollToElement(target);
		});
	}


	/* Testimonial carousel
	   ------------------------------------------------------------------ */

	function initTestimonials() {
		var $carousel = $('.testimonial-carousel-three');
		if (!$carousel.length || !$.fn.owlCarousel) { return; }
		var animate = !prefersReducedMotion();

		// Hide loop clones from screen readers (otherwise every quote is read twice).
		$carousel.on('refreshed.owl.carousel', function () {
			$carousel.find('.owl-item').removeAttr('aria-hidden')
				.filter('.cloned').attr('aria-hidden', 'true');
		});

		$carousel.owlCarousel({
			loop: true,
			margin: 0,
			nav: true,
			smartSpeed: animate ? 500 : 0,
			autoplay: animate,     // previously `autoplay: 5000`, which Owl only reads as "on"
			autoplayTimeout: 5000, // Owl's default, now explicit
			navText: ['<span><img src="images/icons/testimonial-left-arrow.png" alt="" width="50" height="50" /></span>', '<span><img src="images/icons/testimonial-right-arrow.png" alt="" width="50" height="50" /></span>'],
			responsive: {
				0: { items: 1 },
				600: { items: 1 },
				800: { items: 1 },
				1024: { items: 2 },
				1200: { items: 2 }
			}
		});

		// Owl 2.1 renders the arrows as <div>s.
		asButton($carousel.find('.owl-nav .owl-prev'), text.prev);
		asButton($carousel.find('.owl-nav .owl-next'), text.next);

		// Don't rotate slides away while keyboard focus is on the arrows.
		if (animate) {
			$carousel.on('focusin', function () {
				$carousel.trigger('stop.owl.autoplay');
			}).on('focusout', function (event) {
				var next = relatedTarget(event);
				if (!next || !$.contains($carousel[0], next)) { $carousel.trigger('play.owl.autoplay'); }
			});
		}
	}


	/* WOW reveal animations
	   ------------------------------------------------------------------ */

	function initWow() {
		var $boxes = $('.wow');
		if (!$boxes.length) { return; }
		if (prefersReducedMotion() || typeof window.WOW !== 'function') {
			$boxes.css({ visibility: 'visible', animationName: 'none' });
			return;
		}
		new window.WOW({
			boxClass: 'wow',
			animateClass: 'animated',
			offset: 0,
			mobile: true,
			live: false // static content: lets WOW stop polling once everything has animated
		}).init();
	}


	/* Start
	   ------------------------------------------------------------------ */

	function init() {
		$.fx.off = prefersReducedMotion(); // jQuery fades/slides become instant
		var mobileMenu = initMobileMenu();
		initDesktopDropdown();
		initHeader();
		initScrollLinks(mobileMenu);
		initTestimonials();
		initWow();
	}

	// With `defer` the DOM is parsed by now; start immediately so WOW hides
	// its elements as early as possible.
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

})(window.jQuery, window, document);
