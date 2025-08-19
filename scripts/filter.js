const port = document.getElementById("eq-tools-port");
port.remove();

{
  const map = new Map();
  let currentAudioCtx = null;
  let currentSourceNode = null;
  let analyser = null;
  let spectrumTimer = null;

  const { connect } = AudioNode.prototype;

  const attach = (source) => {
    const { context } = source;

    if (port.dataset.enabled === "false") {
      return connect.call(source, context.destination);
    }

    const filters = {
      preamp: context.createGain(),
      balance: context.createStereoPanner(),
    };
    filters.preamp.gain.value = isNaN(port.dataset.preamp)
      ? 1
      : Number(port.dataset.preamp);
    source.connect(filters.preamp);
    filters.balance.pan.value = 0;
    filters.preamp.connect(filters.balance);
    map.set(source, filters);

    var newF = JSON.parse(port.dataset.freqs);
    newF.forEach((filter, i) => {
      const biquadFilter = context.createBiquadFilter();
      biquadFilter.frequency.value = filter.frequency;
      biquadFilter.gain.value = filter.gain;
      biquadFilter.type = filter.type;
      biquadFilter.Q.value = 0.5;
      filters[i] = biquadFilter;
      if (i === 0) {
        filters.balance.connect(biquadFilter);
      } else {
        filters[i - 1].connect(biquadFilter);
      }
    });

    if (port.dataset.enableSpectrum === "true") {
      currentSourceNode = filters[newF.length - 1];
      startSpectrum();
    }

    port.dispatchEvent(new Event("connected"));
    return connect.call(filters[newF.length - 1], context.destination);
  };

  const source = (target) =>
    new Promise((resolve, reject) => {
      const context = new AudioContext();

      const next = () => {
        try {
          const source = context.createMediaElementSource(target);
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
      connect.call(source, source.context.destination);
      port.dispatchEvent(new Event("disconnected"));
    });
  };

  const reattach = () => {
    var newF = JSON.parse(port.dataset.freqs);
    map.forEach((filters, source) => {
      source.disconnect();
      source.connect(filters.preamp);
      connect.call(filters[newF.length - 1], source.context.destination);
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

  const convert = (target) => {
    if (port.dataset.enabled === "false") {
      convert.caches.add(target);
    } else {
      source(target).then(attach);
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
    map.forEach((filters) => {
      var newF = JSON.parse(port.dataset.freqs);
      newF.forEach((filter, i) => {
        filters[i].gain.value = Number(filter.gain);
        filters[i].frequency.value = Number(filter.frequency);
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
    analyser.connect(audioCtx.destination);
    analyser.sampleRate = 48000;
    analyser.fftSize = 512;
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
      }, 40);
    }
  }

  function stopSpectrum() {
    if (spectrumTimer) {
      clearInterval(spectrumTimer);
      spectrumTimer = null;
    }
  }
}
