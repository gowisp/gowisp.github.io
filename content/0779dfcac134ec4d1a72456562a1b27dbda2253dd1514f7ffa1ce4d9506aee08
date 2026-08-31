(function installParityRuntime() {
  "use strict";

  var policyNode = document.querySelector("script[data-parity-runtime-policy]");
  var policy = { localRoutePaths: [], passiveEmbeds: [], sourceOrigin: "" };
  try {
    var parsedPolicy = JSON.parse(policyNode?.textContent || "{}");
    if (typeof parsedPolicy.sourceOrigin === "string") policy.sourceOrigin = parsedPolicy.sourceOrigin;
    if (Array.isArray(parsedPolicy.localRoutePaths)) policy.localRoutePaths = parsedPolicy.localRoutePaths.filter(function (value) { return typeof value === "string"; });
    if (Array.isArray(parsedPolicy.passiveEmbeds)) policy.passiveEmbeds = parsedPolicy.passiveEmbeds.filter(function (value) { return typeof value === "string"; });
  } catch (_) {}
  var sourceOrigin = policy.sourceOrigin;
  var localRoutePaths = new Set(policy.localRoutePaths);
  var diagnostics = { denied: [] };
  Object.defineProperty(window, "__PARITY_DIAGNOSTICS__", {
    configurable: false,
    enumerable: true,
    value: diagnostics,
    writable: false,
  });

  function parseTarget(candidate) {
    try { return new URL(String(candidate), window.location.href); } catch (_) { return null; }
  }

  function isLocal(target) {
    return target && (target.origin === window.location.origin || target.protocol === "data:" || target.protocol === "blob:");
  }

  function isPassiveEmbed(target, transport) {
    return transport === "embed" && target && policy.passiveEmbeds.some(function (prefix) {
      return target.href.startsWith(prefix);
    });
  }

  function classify(candidate, transport) {
    var target = parseTarget(candidate);
    if (isLocal(target)) return { decision: "allow-local", target: target };
    if (isPassiveEmbed(target, transport)) return { decision: "allow-passive-presentation", target: target };
    return { decision: "deny", target: target };
  }

  function recordDenied(transport, target) {
    var redacted = target ? target.origin + target.pathname : "invalid-target";
    if (!diagnostics.denied.some(function (entry) { return entry.transport === transport && entry.target === redacted; })) {
      diagnostics.denied.push({ transport: transport, target: redacted, classification: "non-local-runtime" });
    }
  }

  function allowed(candidate, transport) {
    var result = classify(candidate, transport);
    if (result.decision === "deny") recordDenied(transport, result.target);
    return result.decision !== "deny";
  }

  var nativeFetch = window.fetch.bind(window);
  window.fetch = function parityFetch(input, init) {
    var target = typeof input === "string" || input instanceof URL ? input : input.url;
    if (!allowed(target, "fetch")) return Promise.reject(new TypeError("Parity isolation denied non-local fetch."));
    return nativeFetch(input, init);
  };

  var NativeXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function ParityXMLHttpRequest() {
    var xhr = new NativeXHR();
    var nativeOpen = xhr.open;
    var denied = false;
    xhr.open = function parityOpen(method, url) {
      denied = !allowed(url, "xhr");
      if (!denied) return nativeOpen.apply(xhr, arguments);
    };
    var nativeSend = xhr.send;
    xhr.send = function paritySend() {
      if (!denied) return nativeSend.apply(xhr, arguments);
      window.setTimeout(function () { xhr.dispatchEvent(new ProgressEvent("error")); }, 0);
    };
    return xhr;
  };
  window.XMLHttpRequest.prototype = NativeXHR.prototype;

  var nativeSendBeacon = navigator.sendBeacon?.bind(navigator);
  navigator.sendBeacon = function parityBeacon(url, data) {
    if (!allowed(url, "beacon")) return false;
    return nativeSendBeacon ? nativeSendBeacon(url, data) : false;
  };

  var NativeWebSocket = window.WebSocket;
  window.WebSocket = function ParityWebSocket(url, protocols) {
    if (!allowed(url, "websocket")) throw new DOMException("Parity isolation denied non-local WebSocket.", "SecurityError");
    return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
  };
  window.WebSocket.prototype = NativeWebSocket.prototype;

  function guardUrlProperty(prototype, property, transport) {
    var descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    if (!descriptor || !descriptor.set || !descriptor.get) return;
    Object.defineProperty(prototype, property, {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set: function parityUrlSetter(value) {
        if (allowed(value, transport)) descriptor.set.call(this, value);
      },
    });
  }
  guardUrlProperty(HTMLImageElement.prototype, "src", "pixel");
  guardUrlProperty(HTMLScriptElement.prototype, "src", "script");
  guardUrlProperty(HTMLIFrameElement.prototype, "src", "embed");
  guardUrlProperty(HTMLMediaElement.prototype, "src", "media");
  guardUrlProperty(HTMLVideoElement.prototype, "poster", "media-poster");
  guardUrlProperty(HTMLSourceElement.prototype, "src", "media");

  var nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function paritySetAttribute(name, value) {
    var attribute = String(name).toLowerCase();
    var transport = this instanceof HTMLScriptElement && attribute === "src" ? "script"
      : this instanceof HTMLImageElement && attribute === "src" ? "pixel"
      : this instanceof HTMLIFrameElement && attribute === "src" ? "embed"
      : this instanceof HTMLMediaElement && ["src", "poster"].includes(attribute) ? "media"
      : this instanceof HTMLSourceElement && attribute === "src" ? "media"
      : null;
    if (transport && !allowed(value, transport)) return;
    return nativeSetAttribute.call(this, name, value);
  };

  function insertionAllowed(node) {
    if (node instanceof HTMLScriptElement && node.src && !allowed(node.src, "script")) return false;
    if (node instanceof HTMLImageElement && node.src && !allowed(node.src, "pixel")) return false;
    return true;
  }

  var nativeAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function parityAppendChild(node) {
    return insertionAllowed(node) ? nativeAppendChild.call(this, node) : node;
  };
  var nativeInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function parityInsertBefore(node, reference) {
    return insertionAllowed(node) ? nativeInsertBefore.call(this, node, reference) : node;
  };
  [Element.prototype, Document.prototype, DocumentFragment.prototype].forEach(function (prototype) {
    ["append", "prepend"].forEach(function (method) {
      var nativeMethod = prototype[method];
      if (!nativeMethod) return;
      prototype[method] = function parityVariadicInsert() {
        var nodes = Array.from(arguments).filter(function (node) {
          return !(node instanceof Node) || insertionAllowed(node);
        });
        return nativeMethod.apply(this, nodes);
      };
    });
  });

  function normalizedPath(target) {
    return target.pathname === "/" ? "/" : target.pathname.replace(/\/$/u, "");
  }

  function classifyLink(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) return;
    var rawHref = anchor.getAttribute("href") || "";
    if (!rawHref || rawHref.startsWith("#") || /^(?:mailto:|tel:)/iu.test(rawHref)) return;
    var target = parseTarget(rawHref);
    if (!target || !["http:", "https:"].includes(target.protocol)) return;
    var routePath = normalizedPath(target);
    var terminalDestination = target.origin === window.location.origin || target.origin === sourceOrigin;
    if (terminalDestination && localRoutePaths.has(routePath)) {
      anchor.dataset.parityDestination = "local-route";
      anchor.setAttribute("href", routePath + target.search + target.hash);
      if (anchor.getAttribute("target") === "_blank") anchor.removeAttribute("target");
      return;
    }
    anchor.dataset.parityDestination = terminalDestination ? "reference-link" : "external-reference-link";
    if (terminalDestination) anchor.setAttribute("href", sourceOrigin + routePath + target.search + target.hash);
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }

  function classifyLinks(root) {
    if (root instanceof HTMLAnchorElement) classifyLink(root);
    if (root instanceof Element || root instanceof Document) root.querySelectorAll("a[href]").forEach(classifyLink);
  }

  function installNavigationPolicy() {
    classifyLinks(document);
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (node instanceof Element) classifyLinks(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  var activeSubmissions = new WeakSet();
  document.addEventListener("submit", function isolateSubmission(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    var externalAction = form.getAttribute("action");
    if (externalAction && !allowed(externalAction, "form")) return;
    if (activeSubmissions.has(form)) return;
    void submitToLocalMock(form);
  }, true);

  function ensureMessage(form, role) {
    var previous = form.querySelector("[data-parity-form-message]");
    if (previous) previous.remove();
    var message = document.createElement("p");
    message.dataset.parityFormMessage = "";
    message.setAttribute("role", role);
    message.setAttribute("aria-live", role === "alert" ? "assertive" : "polite");
    form.append(message);
    return message;
  }

  async function submitToLocalMock(form) {
    var fields = Array.from(form.elements).filter(function (field) {
      return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement;
    });
    var invalid = fields.find(function (field) {
      if (field.required && !field.value.trim()) return true;
      return field.type === "email" && field.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value);
    });
    if (invalid) {
      invalid.setAttribute("aria-invalid", "true");
      invalid.focus();
      ensureMessage(form, "alert").textContent = "Enter a valid email in each required field.";
      return;
    }
    fields.forEach(function (field) { field.removeAttribute("aria-invalid"); });
    activeSubmissions.add(form);
    form.setAttribute("aria-busy", "true");
    var submitControls = Array.from(form.elements).filter(function (control) {
      return (control instanceof HTMLButtonElement && (control.type || "submit") === "submit")
        || (control instanceof HTMLInputElement && ["submit", "image"].includes(control.type));
    });
    var disabledStates = submitControls.map(function (control) { return control.disabled; });
    submitControls.forEach(function (control) { control.disabled = true; });
    var values = Object.fromEntries(new FormData(form).entries());
    var mode = Object.values(values).some(function (value) { return String(value).toLowerCase() === "error@terminal.invalid"; }) ? "error" : "success";
    try {
      var response = await window.fetch("/__parity/mock/forms?mode=" + mode, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fields: Object.keys(values).sort() }),
      });
      if (!response.ok) throw new Error("local mock rejected request");
      ensureMessage(form, "status").textContent = "Your response was saved locally for this capsule review.";
    } catch (_) {
      ensureMessage(form, "alert").textContent = "The local service could not complete this request. Try again.";
    } finally {
      form.setAttribute("aria-busy", "false");
      submitControls.forEach(function (control, index) { control.disabled = disabledStates[index]; });
      activeSubmissions.delete(form);
    }
  }

  function fallbackNode(kind, text) {
    var node = document.createElement("div");
    node.dataset.parityFallback = kind;
    node.setAttribute("role", "status");
    node.textContent = text;
    return node;
  }

  function localizeForm(form) {
    if (!(form instanceof HTMLFormElement) || form.dataset.parityLocalForm !== undefined) return form;
    var local = form.cloneNode(true);
    local.dataset.parityLocalForm = "";
    local.removeAttribute("action");
    form.replaceWith(local);
    return local;
  }

  function installLocalForms() {
    document.querySelectorAll("form").forEach(localizeForm);
    new MutationObserver(function (records) {
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) {
          if (!(node instanceof Element)) return;
          if (node.matches("form")) localizeForm(node);
          node.querySelectorAll("form").forEach(localizeForm);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  function installFallbacks() {
    var requested = new URLSearchParams(location.search).get("parity-failure") || "";
    var failures = requested.split(",").filter(Boolean);
    var reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { reduced = true; }
    document.documentElement.dataset.parityMotion = failures.includes("motion") ? "failed" : reduced ? "reduced" : "static-ready";
    function ensureFallback(kind, text) {
      if (!document.querySelector(`[data-parity-fallback="${kind}"]`)) {
        document.querySelector("main")?.append(fallbackNode(kind, text));
      }
    }
    function applyRequestedFailures() {
      if (failures.includes("canvas")) {
      document.querySelectorAll("canvas").forEach(function (canvas) { canvas.hidden = true; });
        ensureFallback("canvas", "Interactive graphics are unavailable. All essential page content remains below.");
      }
      if (failures.includes("media")) {
        document.querySelectorAll("video, audio").forEach(function (media) { media.pause(); media.hidden = true; });
        ensureFallback("media", "Premium media is unavailable. The page transcript and essential content remain available.");
      }
      if (failures.includes("embed")) {
        document.querySelectorAll("iframe").forEach(function (frame) { frame.remove(); });
        ensureFallback("embed", "Embedded presentation unavailable. Continue with the local page content.");
      }
    }
    applyRequestedFailures();
    if (failures.length) {
      var failureObserver = new MutationObserver(function () {
        failureObserver.disconnect();
        applyRequestedFailures();
        failureObserver.observe(document.body, { childList: true, subtree: true });
      });
      failureObserver.observe(document.body, { childList: true, subtree: true });
    }
    var offline = document.querySelector("[data-parity-offline]");
    function updateOnlineState() { if (offline) offline.hidden = navigator.onLine; }
    addEventListener("online", updateOnlineState);
    addEventListener("offline", updateOnlineState);
    updateOnlineState();
    installLocalForms();
    installNavigationPolicy();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installFallbacks, { once: true });
  else installFallbacks();
}());
