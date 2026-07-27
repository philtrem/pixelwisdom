(() => {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const mobileMenu = document.querySelector("[data-mobile-menu]");

  const settleInitialHash = async () => {
    if (!window.location.hash) return;

    let targetId;
    try {
      targetId = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }

    const target = document.getElementById(targetId);
    if (!target) return;

    try {
      await document.fonts?.ready;
    } catch {
      // Font loading should never prevent hash navigation from settling.
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const previousScrollBehavior = root.style.scrollBehavior;
        root.style.scrollBehavior = "auto";
        target.scrollIntoView({ block: "start" });
        root.style.scrollBehavior = previousScrollBehavior;
      });
    });
  };

  window.addEventListener("load", settleInitialHash, { once: true });

  const setMenuOpen = (open, { moveFocus = false } = {}) => {
    if (!menuToggle || !mobileMenu) return;

    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.querySelector(".visually-hidden").textContent = open
      ? "Close navigation"
      : "Open navigation";
    mobileMenu.setAttribute("aria-hidden", String(!open));
    mobileMenu.inert = !open;
    mobileMenu.classList.toggle("is-open", open);
    body.classList.toggle("menu-open", open);

    if (open && moveFocus) {
      mobileMenu.querySelector("a")?.focus();
    }
  };

  if (menuToggle && mobileMenu) {
    setMenuOpen(false);

    menuToggle.addEventListener("click", () => {
      const open = menuToggle.getAttribute("aria-expanded") !== "true";
      setMenuOpen(open, { moveFocus: open });
    });

    mobileMenu.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        setMenuOpen(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menuToggle.getAttribute("aria-expanded") === "true") {
        setMenuOpen(false);
        menuToggle.focus();
      }
    });

    const desktopMedia = window.matchMedia("(min-width: 861px)");
    const closeMenuAtDesktop = (event) => {
      if (event.matches) setMenuOpen(false);
    };
    desktopMedia.addEventListener?.("change", closeMenuAtDesktop);
  }

  const revealItems = [...document.querySelectorAll("[data-reveal]")];
  root.classList.add("reveal-ready");

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 }
    );

    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  const galleryDialogs = [...document.querySelectorAll("[data-gallery-dialog]")];
  const galleryOpeners = [...document.querySelectorAll("[data-gallery-open]")];
  const reduceGalleryMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  galleryDialogs.forEach((dialog) => {
    const galleryId = dialog.dataset.galleryId;
    const openers = galleryOpeners.filter((opener) => opener.dataset.galleryOpen === galleryId);
    const slides = [...dialog.querySelectorAll("[data-gallery-slide]")];
    const galleryImage = dialog.querySelector("[data-gallery-image]");
    const galleryTitle = dialog.querySelector("[data-gallery-title]");
    const galleryDescription = dialog.querySelector("[data-gallery-description]");
    const galleryPosition = dialog.querySelector("[data-gallery-position]");
    const previousButton = dialog.querySelector("[data-gallery-previous]");
    const nextButton = dialog.querySelector("[data-gallery-next]");
    const closeButton = dialog.querySelector("[data-gallery-close]");

    if (
      !galleryId ||
      openers.length === 0 ||
      slides.length === 0 ||
      !galleryImage ||
      !galleryTitle ||
      !galleryDescription ||
      !galleryPosition ||
      !previousButton ||
      !nextButton ||
      !closeButton
    ) {
      return;
    }

    let activeSlide = 0;
    let lastGalleryTrigger = null;

    const normalizedIndex = (index) => ((index % slides.length) + slides.length) % slides.length;

    const renderSlide = (index, { moveThumbnail = false } = {}) => {
      activeSlide = normalizedIndex(index);
      const slide = slides[activeSlide];
      const previousSlide = slides[normalizedIndex(activeSlide - 1)];
      const nextSlide = slides[normalizedIndex(activeSlide + 1)];

      galleryImage.src = slide.dataset.src;
      galleryImage.alt = slide.dataset.alt;
      galleryTitle.textContent = slide.dataset.title;
      galleryDescription.textContent = slide.dataset.description;
      galleryPosition.textContent = `${String(activeSlide + 1).padStart(2, "0")} / ${String(
        slides.length
      ).padStart(2, "0")}`;
      previousButton.setAttribute(
        "aria-label",
        `Show previous screenshot: ${previousSlide.dataset.title}`
      );
      nextButton.setAttribute("aria-label", `Show next screenshot: ${nextSlide.dataset.title}`);

      slides.forEach((item, slideIndex) => {
        if (slideIndex === activeSlide) {
          item.setAttribute("aria-current", "true");
        } else {
          item.removeAttribute("aria-current");
        }
      });

      if (moveThumbnail) {
        slide.scrollIntoView({
          behavior: reduceGalleryMotion.matches ? "auto" : "smooth",
          block: "nearest",
          inline: "nearest"
        });
      }
    };

    const openGallery = (trigger) => {
      const requestedIndex = Number.parseInt(trigger.dataset.galleryIndex || "0", 10);
      lastGalleryTrigger = trigger;
      renderSlide(Number.isNaN(requestedIndex) ? 0 : requestedIndex);
      body.classList.add("dialog-open");

      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }

      closeButton.focus({ preventScroll: true });
    };

    const closeGallery = () => {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
        body.classList.remove("dialog-open");
        lastGalleryTrigger?.focus({ preventScroll: true });
      }
    };

    openers.forEach((trigger) => {
      trigger.addEventListener("click", () => openGallery(trigger));
    });

    slides.forEach((slide, index) => {
      slide.addEventListener("click", () => renderSlide(index, { moveThumbnail: true }));
    });

    previousButton.addEventListener("click", () =>
      renderSlide(activeSlide - 1, { moveThumbnail: true })
    );
    nextButton.addEventListener("click", () =>
      renderSlide(activeSlide + 1, { moveThumbnail: true })
    );
    closeButton.addEventListener("click", closeGallery);

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeGallery();
    });

    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeGallery();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        renderSlide(activeSlide - 1, { moveThumbnail: true });
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        renderSlide(activeSlide + 1, { moveThumbnail: true });
      }
      if (event.key === "Home") {
        event.preventDefault();
        renderSlide(0, { moveThumbnail: true });
      }
      if (event.key === "End") {
        event.preventDefault();
        renderSlide(slides.length - 1, { moveThumbnail: true });
      }
    });

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeGallery();
    });

    dialog.addEventListener("close", () => {
      body.classList.remove("dialog-open");
      lastGalleryTrigger?.focus({ preventScroll: true });
    });
  });

  const contactForm = document.querySelector("[data-contact-form]");
  const formStatus = document.querySelector("[data-form-status]");

  if (!contactForm || !formStatus) return;

  let formStartedAt = Date.now();
  const submitButton = contactForm.querySelector('button[type="submit"]');
  const elapsedInput = contactForm.querySelector("[data-form-elapsed]");
  const pageInput = contactForm.querySelector('input[name="page"]');
  const fields = [...contactForm.querySelectorAll("input[required], select[required], textarea[required]")];

  if (pageInput) pageInput.value = window.location.href;

  const messages = {
    name: "Please add your name.",
    email: "Enter a valid work email address.",
    company: "Add your company or role.",
    timeline: "Choose the closest timing.",
    message: "Tell me what needs to ship."
  };

  const errorElementFor = (field) =>
    contactForm.querySelector(`[data-error-for="${CSS.escape(field.name)}"]`);

  const fieldIsValid = (field) => {
    const value = field.value.trim();
    if (!value) return false;
    if (field.type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return true;
  };

  const renderFieldState = (field, showError) => {
    const valid = fieldIsValid(field);
    const errorElement = errorElementFor(field);
    field.setAttribute("aria-invalid", String(showError && !valid));
    if (errorElement) {
      errorElement.textContent = showError && !valid ? messages[field.name] || "This field is required." : "";
    }
    return valid;
  };

  const setStatus = (message, state = "") => {
    formStatus.textContent = message;
    formStatus.className = `form-status${state ? ` ${state}` : ""}`;
  };

  const friendlyServerError = (response, payload) => {
    if (response.status === 429) {
      return "Too many briefs were sent from this connection. Please try again later.";
    }
    if (response.status >= 500) {
      return "The brief could not be delivered right now. Please try again in a moment.";
    }
    if (payload?.error === "email is invalid") {
      return messages.email;
    }
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error;
    }
    return "Please review the form and try again.";
  };

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("");

    const invalidFields = fields.filter((field) => !renderFieldState(field, true));
    if (invalidFields.length > 0) {
      setStatus("Please review the highlighted fields.", "error");
      invalidFields[0].focus();
      return;
    }

    if (elapsedInput) {
      elapsedInput.value = String(Date.now() - formStartedAt);
    }
    if (pageInput) {
      pageInput.value = window.location.href;
    }

    const originalLabel = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Sending brief…";
    setStatus("Sending your project brief…");

    try {
      const response = await fetch(contactForm.action, {
        method: "POST",
        headers: { accept: "application/json" },
        body: new FormData(contactForm)
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.ok) {
        throw new FormSubmissionError(friendlyServerError(response, payload));
      }

      contactForm.reset();
      fields.forEach((field) => renderFieldState(field, false));
      formStartedAt = Date.now();
      setStatus(
        "Project brief sent. Philippe will review it and reply directly if it is a fit.",
        "success"
      );
    } catch (error) {
      const message =
        error instanceof FormSubmissionError
          ? error.message
          : "The brief could not reach Pixel Wisdom. Check your connection and try again.";
      setStatus(message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  });

  class FormSubmissionError extends Error {}
})();
