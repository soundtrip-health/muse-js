import {
    channelNames,
    muse3ChannelNames,
    EEGReading,
    MuseClient,
    MuseDeviceType,
    setMuse3DebugMode,
} from '../../dist/index.mjs';

// Simple heart rate calculation using peak detection
function calculateHeartRate(ppgBuffer: number[]): number {
    if (ppgBuffer.length < 20) return 0;

    // Find peaks in the PPG signal
    const peaks: number[] = [];
    const threshold = (Math.max(...ppgBuffer) + Math.min(...ppgBuffer)) / 2;

    for (let i = 1; i < ppgBuffer.length - 1; i++) {
        if (ppgBuffer[i] > threshold && ppgBuffer[i] > ppgBuffer[i - 1] && ppgBuffer[i] > ppgBuffer[i + 1]) {
            peaks.push(i);
        }
    }

    if (peaks.length < 2) return 0;

    // Calculate average interval between peaks
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
        intervals.push(peaks[i] - peaks[i - 1]);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Convert to BPM (assuming 50Hz sampling rate for PPG)
    const bpm = (60 * 50) / avgInterval;

    // Sanity check - return 0 if outside reasonable range
    if (bpm < 40 || bpm > 200) return 0;

    return bpm;
}

async function connect() {
    const graphTitles = Array.from(document.querySelectorAll('.electrode-item h3'));
    const canvases = Array.from(document.querySelectorAll('.electrode-item canvas')) as HTMLCanvasElement[];
    const canvasCtx = canvases.map((canvas) => canvas.getContext('2d'));

    function plot(reading: EEGReading) {
        const canvas = canvases[reading.electrode];
        const context = canvasCtx[reading.electrode];
        if (!context) {
            return;
        }
        const width = canvas.width / 12.0;
        const height = canvas.height / 2.0;
        context.fillStyle = 'green';
        context.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = 0; i < reading.samples.length; i++) {
            const sample = reading.samples[i] / 15;
            if (sample > 0) {
                context.fillRect(i * 25, height - sample, width, sample);
            } else {
                context.fillRect(i * 25, height, width, -sample);
            }
        }
    }

    const client = new MuseClient();
    client.connectionStatus.subscribe((status) => {
        console.log(status ? 'Connected!' : 'Disconnected');
    });

    // Check if PPG should be enabled
    const ppgCheckbox = document.getElementById('enable-ppg') as HTMLInputElement;
    const enablePpg = ppgCheckbox && ppgCheckbox.checked;

    // Check if debug mode should be enabled
    const debugCheckbox = document.getElementById('enable-debug') as HTMLInputElement;
    const enableDebug = debugCheckbox && debugCheckbox.checked;
    if (enableDebug) {
        setMuse3DebugMode(true);
        console.log('Muse 3 debug mode enabled');
    }

    try {
        client.enableAux = true;

        if (enablePpg) {
            client.enablePpg = true;
            console.log('PPG enabled');
            // Show PPG section
            const ppgSection = document.getElementById('ppg-section');
            if (ppgSection) {
                ppgSection.style.display = 'block';
            }
        }

        await client.connect();

        // Update UI based on device type
        document.getElementById('device-type')!.innerText = client.deviceType;

        // Update channel names based on device type
        const names = client.deviceType === MuseDeviceType.MUSE_3 ? muse3ChannelNames : channelNames;
        graphTitles.forEach((item, index) => {
            if (index < names.length) {
                item.textContent = names[index];
            }
        });

        // Show Muse 3-specific electrodes if Muse 3 detected
        if (client.deviceType === MuseDeviceType.MUSE_3) {
            const muse3Elements = document.querySelectorAll('.muse3-only');
            muse3Elements.forEach((element) => {
                (element as HTMLElement).style.display = 'block';
            });
        }

        await client.start();
        document.getElementById('headset-name')!.innerText = client.deviceName || 'unknown';
        client.eegReadings.subscribe((reading) => {
            plot(reading);
        });
        client.telemetryData.subscribe((reading) => {
            document.getElementById('temperature')!.innerText = reading.temperature.toString() + '℃';
            document.getElementById('batteryLevel')!.innerText = reading.batteryLevel.toFixed(2) + '%';
        });
        client.accelerometerData.subscribe((accel) => {
            // Data is already scaled to G in parseAccelerometer (scale: 0.0000610352 = 2.0/32768)
            document.getElementById('accelerometer-x')!.innerText = accel.samples[2].x.toFixed(2);
            document.getElementById('accelerometer-y')!.innerText = accel.samples[2].y.toFixed(2);
            document.getElementById('accelerometer-z')!.innerText = accel.samples[2].z.toFixed(2);
        });
        client.gyroscopeData.subscribe((gyro) => {
            // Data is already scaled to °/s in parseGyroscope (scale: 0.0074768 ≈ 250/32768)
            document.getElementById('gyroscope-x')!.innerText = gyro.samples[2].x.toFixed(2);
            document.getElementById('gyroscope-y')!.innerText = gyro.samples[2].y.toFixed(2);
            document.getElementById('gyroscope-z')!.innerText = gyro.samples[2].z.toFixed(2);
        });

        if (enablePpg) {
            // PPGReading has ppgChannel (0=ambient, 1=infrared, 2=red) and samples array
            const ppgBuffer: number[] = [];
            const BUFFER_SIZE = 100;

            client.ppgReadings.subscribe((ppg) => {
                if (!ppg.samples || ppg.samples.length === 0) {
                    return;
                }

                // Display the last sample from this channel
                const lastSample = ppg.samples[ppg.samples.length - 1];

                // Update the appropriate channel display based on ppgChannel
                if (ppg.ppgChannel === 0) {
                    document.getElementById('ppg-ambient')!.innerText = lastSample.toFixed(0);
                } else if (ppg.ppgChannel === 1) {
                    document.getElementById('ppg-infrared')!.innerText = lastSample.toFixed(0);
                    // Use infrared channel for heart rate calculation
                    ppg.samples.forEach((sample) => {
                        ppgBuffer.push(sample);
                        if (ppgBuffer.length > BUFFER_SIZE) {
                            ppgBuffer.shift();
                        }
                    });

                    // Calculate heart rate every 100 samples (roughly every 2 seconds at 50Hz)
                    if (ppgBuffer.length >= BUFFER_SIZE) {
                        const hr = calculateHeartRate(ppgBuffer);
                        if (hr > 0) {
                            document.getElementById('heart-rate')!.innerText = hr.toFixed(0);
                        }
                    }
                } else if (ppg.ppgChannel === 2) {
                    document.getElementById('ppg-red')!.innerText = lastSample.toFixed(0);
                }
            });
        }

        await client.deviceInfo().then((deviceInfo) => {
            document.getElementById('hardware-version')!.innerText = deviceInfo.hw;
            document.getElementById('firmware-version')!.innerText = deviceInfo.fw;
        });
    } catch (err) {
        console.error('Connection failed', err);
    }
}

// Attach event listener when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('connect-button');
    if (button) {
        button.addEventListener('click', connect);
        console.log('Connect button ready!');
    }
});
