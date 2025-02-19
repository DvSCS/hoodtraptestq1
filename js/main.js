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

    // Modifique a declaração do adAudio e adicione o contexto e ganho para o anúncio
    let adAudio;
    let adContext;
    let adGainNode;

    // Adicione esta função para inicializar o áudio do anúncio
    function initAdAudio() {
        adContext = new (window.AudioContext || window.webkitAudioContext)();
        adGainNode = adContext.createGain();
        adGainNode.gain.value = 0.8;

        // Use a URL do GitHub Pages
        const audioElement = new Audio('https://dvscs.github.io/hoodtraptestq1/voz1.mp3');
        
        // Adicione tratamento de erro
        audioElement.onerror = (e) => {
            console.error('Erro ao carregar áudio:', e);
        };

        audioElement.addEventListener('canplaythrough', () => {
            const source = adContext.createMediaElementSource(audioElement);
            source.connect(adGainNode);
            adGainNode.connect(adContext.destination);
            adAudio = audioElement;
        });
    }

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

        try {
            // Criar fonte de áudio
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;  // Use o buffer original diretamente

            // Bass boost
            const bassBoost = offlineContext.createBiquadFilter();
            bassBoost.type = 'lowshelf';
            bassBoost.frequency.value = 100;
            bassBoost.gain.value = (bassBoostValue - 50) * 0.5;

            // Hi-hat
            const hihat = offlineContext.createBiquadFilter();
            hihat.type = 'highshelf';
            hihat.frequency.value = 10000;
            hihat.gain.value = (hiHatValue - 50) * 0.5;

            // Reverb
            const reverbConvolver = offlineContext.createConvolver();
            const reverbBuffer = createReverbBuffer(offlineContext);
            reverbConvolver.buffer = reverbBuffer;
            
            const reverbGain = offlineContext.createGain();
            reverbGain.gain.value = reverbValue / 100;

            // Compressor para controlar dinâmica
            const compressor = offlineContext.createDynamicsCompressor();
            compressor.threshold.value = -24;
            compressor.knee.value = 30;
            compressor.ratio.value = 12;
            compressor.attack.value = 0.003;
            compressor.release.value = 0.25;

            // Ganho final
            const masterGain = offlineContext.createGain();
            masterGain.gain.value = 0.9;

            // Conectar nós
            source.connect(bassBoost);
            bassBoost.connect(hihat);
            hihat.connect(compressor);
            
            // Processamento paralelo do reverb
            compressor.connect(reverbConvolver);
            reverbConvolver.connect(reverbGain);
            reverbGain.connect(masterGain);
            
            // Conexão direta também
            compressor.connect(masterGain);
            
            // Conexão final
            masterGain.connect(offlineContext.destination);

            // Iniciar processamento
            source.start(0);
            
            // Renderizar e retornar
            return await offlineContext.startRendering();

        } catch (error) {
            console.error('Erro detalhado:', error);
            throw new Error('Falha no processamento do áudio');
        }
    }

    // Adicione esta função auxiliar para criar o buffer de reverb
    function createReverbBuffer(context) {
        const sampleRate = context.sampleRate;
        const length = sampleRate * 2; // 2 segundos de reverb
        const impulse = context.createBuffer(2, length, sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }
        
        return impulse;
    }

    // Convert button click handler
    convertBtn.addEventListener('click', async () => {
        if (!audioBuffer) {
            alert('Por favor, faça upload de um arquivo de áudio primeiro');
            return;
        }

        convertBtn.textContent = 'Processando...';
        convertBtn.disabled = true;

        try {
            processedBuffer = await processAudio();
            
            // Converter para WAV e criar URL
            const wav = audioBufferToWav(processedBuffer);
            const blob = new Blob([wav], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            
            // Carregar no WaveSurfer
            wavesurfer.load(url);
            
            // Habilitar botões
            downloadBtn.disabled = false;
            shareBtn.disabled = false;

            // Limpar URL após carregar
            wavesurfer.on('ready', () => {
                URL.revokeObjectURL(url);
            });
        } catch (error) {
            console.error('Erro no processamento:', error);
            alert('Erro no processamento. Tente novamente.');
        } finally {
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

    // Função para calcular o volume médio de um AudioBuffer
    function calculateAverageVolume(buffer) {
        let sum = 0;
        const channelData = buffer.getChannelData(0); // Use o primeiro canal para a análise
        
        // Calcule a média RMS do sinal
        for (let i = 0; i < channelData.length; i++) {
            sum += channelData[i] * channelData[i];
        }
        
        return Math.sqrt(sum / channelData.length);
    }

    // Chame initAdAudio() quando o documento carregar
    initAdAudio();
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
