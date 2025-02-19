document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const controlsSection = document.getElementById('controlsSection');
    const convertBtn = document.getElementById('convertBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const shareBtn = document.getElementById('shareBtn');
    
    let wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: '#4f4f4f',
        progressColor: '#00f3ff',
        cursorColor: '#39ff14',
        barWidth: 2,
        barRadius: 3,
        responsive: true,
        height: 100,
    });

    // Audio Context and nodes
    let audioContext;
    let sourceNode;
    let audioBuffer;
    let processedBuffer;

    // Audio processing nodes
    let bassBoostFilter;
    let hiHatFilter;
    let reverbNode;
    let convolver;

    // Initialize audio context
    function initAudioContext() {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create filters
        bassBoostFilter = audioContext.createBiquadFilter();
        bassBoostFilter.type = 'lowshelf';
        bassBoostFilter.frequency.value = 100;

        hiHatFilter = audioContext.createBiquadFilter();
        hiHatFilter.type = 'highshelf';
        hiHatFilter.frequency.value = 10000;

        // Create reverb convolver
        convolver = audioContext.createConvolver();
        createReverb();
    }

    // Create impulse response for reverb
    function createReverb() {
        const sampleRate = audioContext.sampleRate;
        const length = sampleRate * 2; // 2 seconds
        const impulse = audioContext.createBuffer(2, length, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }
        
        convolver.buffer = impulse;
    }

    // Drag and drop functionality
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#39ff14';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#00f3ff';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        handleFile(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        handleFile(file);
    });

    function handleFile(file) {
        if (file && file.type.startsWith('audio/')) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                // Load into WaveSurfer for visualization
                wavesurfer.load(e.target.result);
                
                // Initialize audio context if not already done
                if (!audioContext) {
                    initAudioContext();
                }

                // Decode audio data
                const arrayBuffer = await file.arrayBuffer();
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                controlsSection.classList.remove('hidden');
                downloadBtn.disabled = true;
                shareBtn.disabled = true;
            };
            reader.readAsDataURL(file);
        } else {
            alert('Please upload an audio file');
        }
    }

    // Process audio with current settings
    async function processAudio() {
        const bassBoostValue = document.getElementById('bassBoost').value;
        const hiHatValue = document.getElementById('hiHat').value;
        const reverbValue = document.getElementById('reverb').value;

        // Create offline context for processing
        const offlineContext = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        );

        // Create nodes in offline context
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;

        // Bass boost
        const bass = offlineContext.createBiquadFilter();
        bass.type = 'lowshelf';
        bass.frequency.value = 100;
        bass.gain.value = (bassBoostValue - 50) * 0.5;

        // Hi-hat enhancement
        const hihat = offlineContext.createBiquadFilter();
        hihat.type = 'highshelf';
        hihat.frequency.value = 10000;
        hihat.gain.value = (hiHatValue - 50) * 0.5;

        // Vocal processing chain
        // 1. Distortion
        const distortion = offlineContext.createWaveShaper();
        distortion.curve = createDistortionCurve(50); // Adjust distortion amount

        // 2. Vocal EQ
        const vocalEQ = offlineContext.createBiquadFilter();
        vocalEQ.type = 'peaking';
        vocalEQ.frequency.value = 2500; // Boost presence
        vocalEQ.Q.value = 1;
        vocalEQ.gain.value = 6;

        // 3. Compression
        const compressor = offlineContext.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 4;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        // 4. Saturation
        const saturation = offlineContext.createWaveShaper();
        saturation.curve = createSaturationCurve(2); // Adjust saturation amount

        // Reverb
        const reverbConvolver = offlineContext.createConvolver();
        reverbConvolver.buffer = convolver.buffer;
        const reverbGain = offlineContext.createGain();
        reverbGain.gain.value = reverbValue / 100;

        // Final output gain
        const outputGain = offlineContext.createGain();
        outputGain.gain.value = 0.9; // Prevent clipping

        // Connect nodes
        source.connect(bass);
        bass.connect(hihat);
        hihat.connect(distortion);
        distortion.connect(vocalEQ);
        vocalEQ.connect(compressor);
        compressor.connect(saturation);
        saturation.connect(outputGain);
        
        // Parallel reverb processing
        saturation.connect(reverbConvolver);
        reverbConvolver.connect(reverbGain);
        reverbGain.connect(outputGain);
        
        outputGain.connect(offlineContext.destination);

        // Start processing
        source.start();

        // Render audio
        return await offlineContext.startRendering();
    }

    // Helper function to create distortion curve
    function createDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;

        for (let i = 0; i < samples; ++i) {
            const x = (i * 2) / samples - 1;
            curve[i] = (3 + amount) * x * 20 * deg / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    // Helper function to create saturation curve
    function createSaturationCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        
        for (let i = 0; i < samples; ++i) {
            const x = (i * 2) / samples - 1;
            curve[i] = Math.tanh(x * amount);
        }
        return curve;
    }

    // Convert button click handler
    convertBtn.addEventListener('click', async () => {
        if (!audioBuffer) {
            alert('Please upload an audio file first');
            return;
        }

        convertBtn.textContent = 'Processing...';
        convertBtn.disabled = true;

        try {
            processedBuffer = await processAudio();
            
            // Convert AudioBuffer to Blob for WaveSurfer
            const wav = audioBufferToWav(processedBuffer);
            const blob = new Blob([wav], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            
            // Load the processed audio into WaveSurfer
            wavesurfer.load(url);
            
            convertBtn.textContent = 'Convert';
            convertBtn.disabled = false;
            downloadBtn.disabled = false;
            shareBtn.disabled = false;

            // Clean up the URL after loading
            wavesurfer.on('ready', () => {
                URL.revokeObjectURL(url);
            });
        } catch (error) {
            console.error('Error processing audio:', error);
            alert('Error processing audio. Please try again.');
            convertBtn.textContent = 'Convert';
            convertBtn.disabled = false;
        }
    });

    // Download button click handler
    downloadBtn.addEventListener('click', () => {
        if (!processedBuffer) return;

        // Create WAV file from processed buffer
        const wav = audioBufferToWav(processedBuffer);
        const blob = new Blob([wav], { type: 'audio/wav' });
        
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hood_trap_remix.wav';
        a.click();
        
        URL.revokeObjectURL(url);
    });

    // Share button click handler
    shareBtn.addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({
                title: 'My Hood Trap Track',
                text: 'Check out my Hood Trap remix!',
                url: window.location.href,
            })
            .catch(console.error);
        } else {
            alert('Sharing is not supported on this browser');
        }
    });
});

// Helper function to convert AudioBuffer to WAV format
function audioBufferToWav(buffer) {
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    let result = new Float32Array(buffer.length * numberOfChannels);
    
    // Interleave channels
    for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < buffer.length; i++) {
            result[i * numberOfChannels + channel] = channelData[i];
        }
    }
    
    // Convert to 16-bit PCM
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    
    const wav = new ArrayBuffer(44 + result.length * bytesPerSample);
    const view = new DataView(wav);
    
    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + result.length * bytesPerSample, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, result.length * bytesPerSample, true);
    
    // Write audio data
    const offset = 44;
    for (let i = 0; i < result.length; i++) {
        const sample = Math.max(-1, Math.min(1, result[i]));
        view.setInt16(offset + i * bytesPerSample, sample * 0x7FFF, true);
    }
    
    return new Uint8Array(wav);
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
} 