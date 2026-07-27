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

  const arcDialog = document.querySelector("[data-arc-dialog]");
  const arcGalleryOpeners = [...document.querySelectorAll("[data-arc-gallery-open]")];

  if (arcDialog && arcGalleryOpeners.length > 0) {
    const arcSlides = [...arcDialog.querySelectorAll("[data-arc-slide]")];
    const arcImage = arcDialog.querySelector("[data-arc-dialog-image]");
    const arcTitle = arcDialog.querySelector("[data-arc-dialog-title]");
    const arcDescription = arcDialog.querySelector("[data-arc-dialog-description]");
    const arcPosition = arcDialog.querySelector("[data-arc-dialog-position]");
    const previousButton = arcDialog.querySelector("[data-arc-dialog-previous]");
    const nextButton = arcDialog.querySelector("[data-arc-dialog-next]");
    const closeButton = arcDialog.querySelector("[data-arc-dialog-close]");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let activeArcSlide = 0;
    let lastArcGalleryTrigger = null;

    const normalizedArcIndex = (index) =>
      ((index % arcSlides.length) + arcSlides.length) % arcSlides.length;

    const renderArcSlide = (index, { moveThumbnail = false } = {}) => {
      activeArcSlide = normalizedArcIndex(index);
      const slide = arcSlides[activeArcSlide];
      const previousSlide = arcSlides[normalizedArcIndex(activeArcSlide - 1)];
      const nextSlide = arcSlides[normalizedArcIndex(activeArcSlide + 1)];

      arcImage.src = slide.dataset.src;
      arcImage.alt = slide.dataset.alt;
      arcTitle.textContent = slide.dataset.title;
      arcDescription.textContent = slide.dataset.description;
      arcPosition.textContent = `${String(activeArcSlide + 1).padStart(2, "0")} / ${String(
        arcSlides.length
      ).padStart(2, "0")}`;
      previousButton.setAttribute(
        "aria-label",
        `Show previous screenshot: ${previousSlide.dataset.title}`
      );
      nextButton.setAttribute("aria-label", `Show next screenshot: ${nextSlide.dataset.title}`);

      arcSlides.forEach((item, slideIndex) => {
        if (slideIndex === activeArcSlide) {
          item.setAttribute("aria-current", "true");
        } else {
          item.removeAttribute("aria-current");
        }
      });

      if (moveThumbnail) {
        slide.scrollIntoView({
          behavior: reduceMotion.matches ? "auto" : "smooth",
          block: "nearest",
          inline: "nearest"
        });
      }
    };

    const openArcGallery = (trigger) => {
      const requestedIndex = Number.parseInt(trigger.dataset.galleryIndex || "0", 10);
      lastArcGalleryTrigger = trigger;
      renderArcSlide(Number.isNaN(requestedIndex) ? 0 : requestedIndex);
      body.classList.add("dialog-open");

      if (typeof arcDialog.showModal === "function") {
        arcDialog.showModal();
      } else {
        arcDialog.setAttribute("open", "");
      }

      closeButton.focus({ preventScroll: true });
    };

    const closeArcGallery = () => {
      if (typeof arcDialog.close === "function") {
        arcDialog.close();
      } else {
        arcDialog.removeAttribute("open");
        body.classList.remove("dialog-open");
        lastArcGalleryTrigger?.focus({ preventScroll: true });
      }
    };

    arcGalleryOpeners.forEach((trigger) => {
      trigger.addEventListener("click", () => openArcGallery(trigger));
    });

    arcSlides.forEach((slide, index) => {
      slide.addEventListener("click", () => renderArcSlide(index, { moveThumbnail: true }));
    });

    previousButton.addEventListener("click", () =>
      renderArcSlide(activeArcSlide - 1, { moveThumbnail: true })
    );
    nextButton.addEventListener("click", () =>
      renderArcSlide(activeArcSlide + 1, { moveThumbnail: true })
    );
    closeButton.addEventListener("click", closeArcGallery);

    arcDialog.addEventListener("click", (event) => {
      if (event.target === arcDialog) closeArcGallery();
    });

    arcDialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeArcGallery();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        renderArcSlide(activeArcSlide - 1, { moveThumbnail: true });
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        renderArcSlide(activeArcSlide + 1, { moveThumbnail: true });
      }
      if (event.key === "Home") {
        event.preventDefault();
        renderArcSlide(0, { moveThumbnail: true });
      }
      if (event.key === "End") {
        event.preventDefault();
        renderArcSlide(arcSlides.length - 1, { moveThumbnail: true });
      }
    });

    arcDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeArcGallery();
    });

    arcDialog.addEventListener("close", () => {
      body.classList.remove("dialog-open");
      lastArcGalleryTrigger?.focus({ preventScroll: true });
    });
  }

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
