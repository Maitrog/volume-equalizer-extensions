const port = document.getElementById("eq-tools-port");
port.remove();

{
  const map = new Map();
  let currentAudioCtx = null;
  let currentSourceNode = null;
  let analyser = null;
  let spectrumTimer = null;
  const mediaSources = new WeakMap();
  const pendingMedia = new WeakSet();

  const { connect } = AudioNode.prototype;

  const getBiquadFilterCount = (filters) => {
    let count = 0;
    while (filters[count]) count++;
    return count;
  };

  const applyBiquadSettings = (biquadFilter, filter) => {
    biquadFilter.type = filter.type ?? "peaking";
    biquadFilter.gain.value = Number(filter.gain ?? 0);
    biquadFilter.frequency.value = Number(filter.freq);
    biquadFilter.Q.value = Number(filter.q ?? 0.5);
  };

  const createBiquadFilter = (context, filter) => {
    const biquadFilter = context.createBiquadFilter();
    applyBiquadSettings(biquadFilter, filter);
    return biquadFilter;
  };

  const getLastBiquadFilter = (filters) => {
    const count = getBiquadFilterCount(filters);
    return count > 0 ? filters[count - 1] : filters.balance;
  };

  const rebuildBiquadChain = (source, filters, filterSettings) => {
    filters.balance.disconnect();

    const oldCount = getBiquadFilterCount(filters);
    for (let i = 0; i < oldCount; i++) {
      filters[i].disconnect();
      delete filters[i];
    }

    let previousNode = filters.balance;
    filterSettings.forEach((filter, i) => {
      const biquadFilter = createBiquadFilter(source.context, filter);
      previousNode.connect(biquadFilter);
      filters[i] = biquadFilter;
      previousNode = biquadFilter;
    });

    connect.call(previousNode, source.context.destination);
  };

  const attach = (source) => {
    const { context } = source;

    if (port.dataset.enabled === "false") {
      return connect.call(source, context.destination);
    }

    if (map.has(source)) {
      port.dispatchEvent(new Event("connected"));
      return context.destination;
    }

    const filters = {
      preamp: context.createGain(),
      balance: context.createStereoPanner(),
    };
    const preampValue = isNaN(port.dataset.preamp)
      ? 1
      : Number(port.dataset.preamp);
    filters.preamp.gain.value = port.dataset.mute === "true" ? 0 : preampValue;
    source.connect(filters.preamp);
    filters.balance.pan.value = 0;
    filters.preamp.connect(filters.balance);
    map.set(source, filters);

    var newF = JSON.parse(port.dataset.freqs);
    rebuildBiquadChain(source, filters, newF);

    if (port.dataset.enableSpectrum === "true") {
      currentSourceNode = filters[newF.length - 1];
      startSpectrum();
    }

    port.dispatchEvent(new Event("connected"));
    return context.destination;
  };

  const source = (target) =>
    new Promise((resolve, reject) => {
      const existing = mediaSources.get(target);
      if (existing) {
        setCurrentAudioGraph(existing.context, existing.source);
        resolve(existing.source);
        return;
      }

      const context = new AudioContext();

      const next = () => {
        try {
          const source = context.createMediaElementSource(target);
          mediaSources.set(target, { context, source });
          setCurrentAudioGraph(context, source);
          resolve(source);
        } catch (e) {
          reject(e);
        }
      };

      setTimeout(() => {
        try {
          target.setAttribute("crossOrigin", "anonymous");
          // make sure we do not have CORS issue
          target.captureStream();
          // get the source
          next();
        } catch (e) {
          if (e?.message?.includes("cross-origin")) {
            reject(e);
          } else {
            next();
          }
        }
      });
    });

  const detach = () => {
    map.forEach((filters, source) => {
      source.disconnect();
      getLastBiquadFilter(filters).disconnect();
      connect.call(source, source.context.destination);
      port.dispatchEvent(new Event("disconnected"));
    });
  };

  const reattach = () => {
    var newF = JSON.parse(port.dataset.freqs);
    map.forEach((filters, source) => {
      source.disconnect();
      source.connect(filters.preamp);
      if (getBiquadFilterCount(filters) !== newF.length) {
        rebuildBiquadChain(source, filters, newF);
      } else {
        newF.forEach((filter, i) => {
          applyBiquadSettings(filters[i], filter);
        });
        const lastFilter = getLastBiquadFilter(filters);
        lastFilter.disconnect();
        connect.call(lastFilter, source.context.destination);
      }

      if (port.dataset.enableSpectrum === "true") {
        currentSourceNode = getLastBiquadFilter(filters);
        analyser = null;
        startSpectrum();
      }
      port.dispatchEvent(new Event("connected"));
    });
    if (map.size) {
      port.dispatchEvent(new Event("connected"));
    }
  };

  AudioNode.prototype.connect = new Proxy(AudioNode.prototype.connect, {
    apply(target, self, args) {
      const [node] = args;

      if (node && node instanceof AudioDestinationNode) {
        try {
          return attach(self);
        } catch (e) {
          console.warn("cannot equalize;", e.message);
          port.dispatchEvent(new Event("cannot-attach"));
        }
      }

      return Reflect.apply(target, self, args);
    },
  });

  const convert = async (target) => {
    if (!(target instanceof HTMLMediaElement)) return;

    if (port.dataset.enabled === "false") {
      convert.caches.add(target);
      return;
    }

    if (pendingMedia.has(target)) return;

    try {
      pendingMedia.add(target);
      const sourceNode = await source(target);
      if (!map.has(sourceNode)) {
        attach(sourceNode);
      } else {
        port.dispatchEvent(new Event("connected"));
      }
    } catch (e) {
      port.dispatchEvent(
        new CustomEvent("capture-error", {
          detail: { message: e?.message ?? "Unknown error" },
        })
      );
    } finally {
      pendingMedia.delete(target);
    }
  };
  convert.caches = new Set();

  window.addEventListener("playing", (e) => convert(e.target), true);

  self.Audio = new Proxy(self.Audio, {
    construct(target, args, newTarget) {
      const r = Reflect.construct(target, args, newTarget);
      try {
        convert(r);
      } catch (e) {
        console.error(e);
      }
      return r;
    },
  });

  HTMLMediaElement.prototype.play = new Proxy(HTMLMediaElement.prototype.play, {
    apply(target, self, args) {
      if (self.isConnected === false) {
        try {
          convert(self);
        } catch (e) {
          console.error(e);
        }
      }

      return Reflect.apply(target, self, args);
    },
  });

  port.addEventListener("filters-changed", () =>
    map.forEach((filters, source) => {
      var newF = JSON.parse(port.dataset.freqs);
      if (getBiquadFilterCount(filters) !== newF.length) {
        rebuildBiquadChain(source, filters, newF);
        if (port.dataset.enableSpectrum === "true") {
          currentSourceNode = filters[newF.length - 1];
          analyser = null;
          startSpectrum();
        }
        port.dispatchEvent(new Event("connected"));
        return;
      }

      newF.forEach((filter, i) => {
        applyBiquadSettings(filters[i], filter);
      });
    })
  );
  port.addEventListener("preamp-changed", () =>
    map.forEach((filters) => {
      filters.preamp.gain.value = Number(port.dataset.preamp);
    })
  );
  port.addEventListener("mute-enabled", () =>
    map.forEach((filters) => {
      filters.preamp.gain.value = Number(0);
    })
  );
  port.addEventListener("mute-disabled", () =>
    map.forEach((filters) => {
      filters.preamp.gain.value = Number(port.dataset.preamp);
    })
  );
  port.addEventListener("enabled-changed", () => {
    if (port.dataset.enabled === "false") {
      detach();
    } else {
      reattach();

      if (convert.caches.size) {
        for (const target of convert.caches) {
          convert(target);
        }
        convert.caches.clear();
      }
    }
  });

  function ensureAnalyser(audioCtx, sourceNode) {
    if (!audioCtx || !sourceNode) return null;
    if (analyser) return analyser;

    analyser = audioCtx.createAnalyser();
    analyser.sampleRate = 48000;
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;

    try {
      sourceNode.connect(analyser);
    } catch (e) {}
    return analyser;
  }

  function setCurrentAudioGraph(audioCtx, sourceNode) {
    currentAudioCtx = audioCtx;
    currentSourceNode = sourceNode;
    analyser = null;
  }

  function startSpectrum() {
    {
      const ac = currentAudioCtx;
      const src = currentSourceNode;
      const an = ensureAnalyser(ac, src);

      if (!ac || !src || !an) {
        return;
      }

      let payload = {
        type: "meta",
        sampleRate: ac.sampleRate,
        fftSize: an.fftSize,
        minDb: an.minDecibels,
        maxDb: an.maxDecibels,
        frequencyBinCount: an.frequencyBinCount,
      };
      port.dispatchEvent(
        new CustomEvent("spectrum-frame", {
          detail: { ...payload },
          bubbles: true,
          composed: true,
        })
      );

      if (spectrumTimer) clearInterval(spectrumTimer);
      spectrumTimer = setInterval(() => {
        if (!an) return;
        const n = an.frequencyBinCount;
        const f32 = new Float32Array(n);
        an.getFloatFrequencyData(f32);

        payload = {
          type: "spectrum",
          buffer: f32,
        };
        port.dispatchEvent(
          new CustomEvent("spectrum-frame", {
            detail: { ...payload },
            bubbles: true,
            composed: true,
          })
        );
      }, 50);
    }
  }

  function stopSpectrum() {
    if (spectrumTimer) {
      clearInterval(spectrumTimer);
      spectrumTimer = null;
    }
  }
}
