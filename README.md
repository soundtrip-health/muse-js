# muse-js

[![CI](https://github.com/urish/muse-js/actions/workflows/ci.yml/badge.svg)](https://github.com/urish/muse-js/actions/workflows/ci.yml)

Modern JavaScript library for Muse EEG headsets using the Web Bluetooth API.

## Supported Devices

- ✅ **Muse 1** (2016)
- ✅ **Muse 2**
- ✅ **Muse S** (Classic)
- ✅ **Muse 3 / S Athena** - Full support with 8-channel EEG, PPG, and IMU streaming (see [MUSE3_STATUS.md](./MUSE3_STATUS.md) for details)

## Features

- 🧠 Real-time EEG data streaming
- 📊 PPG (Photoplethysmography) sensor support
- 📐 Accelerometer and gyroscope data
- 🔋 Battery and telemetry information
- 🎯 Event markers for experiments
- 📦 Dual ESM/CommonJS builds
- 💪 Written in TypeScript
- 🌐 Works in modern browsers via Web Bluetooth API
- 📱 Node.js support

## Installation

### From npm

```bash
npm install muse-js
```

### From Local Source (Development)

If you want to use this package before it's published to npm:

**Option 1: Install from local directory**
```bash
cd /path/to/muse-js
npm run build
npm link

# In your project directory
npm link muse-js
```

**Option 2: Install from local tarball**
```bash
cd /path/to/muse-js
npm pack
# This creates muse-js-4.0.0.tgz

# In your project directory
npm install /path/to/muse-js/muse-js-4.0.0.tgz
```

**Option 3: Install from GitHub**
```bash
# Install from a specific branch
npm install github:urish/muse-js#muse3

# Or install from a specific commit
npm install github:urish/muse-js#abc1234
```

## Running the Demo App

The demo application showcases real-time EEG visualization:

```bash
# Install dependencies
npm install
npm run demo:install

# Start the demo server
npm start
```

Then open http://localhost:4445/ in your browser.

## Usage example

```javascript

import { MuseClient } from 'muse-js';

async function main() {
  let client = new MuseClient();
  await client.connect();
  await client.start();
  client.eegReadings.subscribe(reading => {
    console.log(reading);
  });
  client.telemetryData.subscribe(telemetry => {
    console.log(telemetry);
  });
  client.accelerometerData.subscribe(acceleration => {
    console.log(acceleration);
  });
}

main();
```

## API Reference

### MuseClient

The main class for interacting with Muse devices.

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `enableAux` | `boolean` | Enable auxiliary electrode (Muse 1/2016 only). Set before `connect()`. Default: `false` |
| `enablePpg` | `boolean` | Enable PPG sensors (Muse 2/S/3 only). Set before `connect()`. Default: `false` |
| `deviceName` | `string \| null` | Connected device name |
| `deviceType` | `MuseDeviceType` | Automatically detected device type (`MUSE_1_2_S` or `MUSE_3`) |
| `connectionStatus` | `BehaviorSubject<boolean>` | Observable connection status |
| `eegReadings` | `Observable<EEGReading>` | Stream of EEG readings |
| `ppgReadings` | `Observable<PPGReading>` | Stream of PPG readings (if enabled) |
| `telemetryData` | `Observable<TelemetryData>` | Stream of battery/temperature data |
| `accelerometerData` | `Observable<AccelerometerData>` | Stream of accelerometer data |
| `gyroscopeData` | `Observable<GyroscopeData>` | Stream of gyroscope data |
| `eventMarkers` | `Subject<EventMarker>` | Stream for custom event markers |

#### Methods

##### `connect(gatt?: BluetoothRemoteGATTServer): Promise<void>`

Connects to a Muse device. If `gatt` is not provided, opens browser's Bluetooth device picker.

```javascript
await client.connect();
```

##### `start(preset?: MusePreset): Promise<void>`

Starts data streaming. For Muse 3, you can specify a preset configuration.

```javascript
// Muse 1/2/S - uses automatic preset selection
await client.start();

// Muse 3 - specify preset (default: 'p1035')
await client.start('p1035'); // 4 EEG + 4 PPG + IMU
await client.start('p1041'); // 8 EEG + 16 PPG + IMU
```

##### `pause(): Promise<void>`

Pauses data streaming.

```javascript
await client.pause();
```

##### `resume(): Promise<void>`

Resumes data streaming.

```javascript
await client.resume();
```

##### `deviceInfo(): Promise<MuseDeviceInfo>`

Retrieves device information (firmware, hardware version, etc.).

```javascript
const info = await client.deviceInfo();
console.log(info.fw, info.hw);
```

##### `injectMarker(value: string | number, timestamp?: number): Promise<void>`

Injects a custom event marker into the event stream.

```javascript
await client.injectMarker('stimulus-start');
await client.injectMarker('stimulus-end', Date.now());
```

##### `disconnect(): void`

Disconnects from the device.

```javascript
client.disconnect();
```

### Data Types

#### EEGReading

```typescript
interface EEGReading {
  electrode: number;      // Electrode index (0-4 for Classic, 0-7 for Muse 3)
  index: number;          // Sample sequence number
  timestamp: number;      // Milliseconds since epoch
  samples: number[];      // 12 samples in microvolts (256 Hz / 12 samples = ~21ms per reading)
}
```

**Electrode mapping (Classic Muse 1/2/S):**
- 0: TP9 (left ear)
- 1: AF7 (left forehead)
- 2: AF8 (right forehead)
- 3: TP10 (right ear)
- 4: AUX (optional auxiliary electrode)

**Electrode mapping (Muse 3):**
- 0: TP9, 1: AF7, 2: AF8, 3: TP10
- 4: FPz, 5: AUX_R, 6: AUX_L, 7: AUX

#### PPGReading

```typescript
interface PPGReading {
  ppgChannel: number;     // PPG channel (0=ambient, 1=infrared, 2=red)
  index: number;          // Sample sequence number
  timestamp: number;      // Milliseconds since epoch
  samples: number[];      // 6 samples (64 Hz for Classic, varies for Muse 3)
}
```

#### TelemetryData

```typescript
interface TelemetryData {
  sequenceId: number;
  batteryLevel: number;      // Battery percentage (0-100)
  fuelGaugeVoltage: number;  // Battery voltage
  temperature: number;        // Device temperature
}
```

#### AccelerometerData / GyroscopeData

```typescript
interface AccelerometerData {
  sequenceId: number;
  samples: XYZ[];  // 3 samples per reading (52 Hz)
}

interface XYZ {
  x: number;  // Accelerometer: g-force, Gyroscope: degrees/second
  y: number;
  z: number;
}
```

### Exported Constants

```typescript
// Sampling rates
export const EEG_FREQUENCY = 256;              // Hz
export const EEG_SAMPLES_PER_READING = 12;     // Samples per packet
export const PPG_FREQUENCY = 64;                // Hz (Classic Muse)
export const PPG_SAMPLES_PER_READING = 6;      // Samples per packet

// Channel names
export const channelNames = ['TP9', 'AF7', 'AF8', 'TP10', 'AUX'];
export const muse3ChannelNames = ['TP9', 'AF7', 'AF8', 'TP10', 'FPz', 'AUX_R', 'AUX_L', 'AUX'];
export const ppgChannelNames = ['ambient', 'infrared', 'red'];

// Device types
export enum MuseDeviceType {
  MUSE_1_2_S = 'Muse 1/2/S',
  MUSE_3 = 'Muse 3 (S Athena)'
}
```

### Muse 3 Presets

Available presets for `client.start(preset)` on Muse 3 devices:

| Preset | EEG Channels | PPG Channels | IMU | LED | Description |
|--------|--------------|--------------|-----|-----|-------------|
| `p1035` | 4 | 4 | ✅ | Dim | **Recommended** - Balanced performance |
| `p1041` | 8 | 16 | ✅ | Bright | Maximum data collection |
| `p1042` | 8 | 16 | ✅ | Bright | Same as p1041 |
| `p1034` | 8 | 8 | ✅ | Bright | High resolution EEG + PPG |
| `p1043` | 8 | 8 | ✅ | Bright | Same as p1034 |
| `p1044` | 8 | 8 | ✅ | Dim | Same as p1034, dimmer LED |
| `p20` | 4 | 0 | ✅ | Off | EEG only |
| `p21` | 4 | 0 | ✅ | Off | EEG only |
| `p50` | 4 | 0 | ✅ | Off | EEG only |
| `p51` | 4 | 0 | ✅ | Off | EEG only |
| `p60` | 4 | 0 | ✅ | Off | EEG only |
| `p61` | 4 | 0 | ✅ | Off | EEG only |

### Utility Functions

#### zipSamples / zipSamplesPpg

Helper functions to combine samples from multiple electrodes/channels into timestamped arrays.

```typescript
import { MuseClient, zipSamples, EEGSample } from 'muse-js';

const client = new MuseClient();
await client.connect();
await client.start();

zipSamples(client.eegReadings).subscribe((sample: EEGSample) => {
  console.log(sample); // { timestamp, data: [ch0, ch1, ch2, ch3, ch4] }
});
```

#### setMuse3DebugMode

Enable debug logging for Muse 3 packet parsing.

```typescript
import { setMuse3DebugMode } from 'muse-js';

setMuse3DebugMode(true);  // Enable detailed console logs
```

## TypeScript Support

This library is written in TypeScript and exports all type definitions. Import types as needed:

```typescript
import {
  MuseClient,
  MuseDeviceType,
  MusePreset,
  EEGReading,
  PPGReading,
  TelemetryData,
  AccelerometerData,
  GyroscopeData,
  EventMarker,
  XYZ,
  channelNames,
  muse3ChannelNames,
  ppgChannelNames
} from 'muse-js';

// Type-safe preset selection
const preset: MusePreset = 'p1035';

// Type-safe device type checking
if (client.deviceType === MuseDeviceType.MUSE_3) {
  console.log('Using Muse 3');
}
```

## What's New in v4.0

🎉 **Major modernization update!**

- ⚡ Modern build system with dual ESM/CommonJS output via [tsup](https://tsup.egoist.dev/)
- 📦 TypeScript 5.x with modern ES2020 target
- ✅ Updated to latest dependencies (RxJS 7, Jest 29, ESLint)
- 🔄 Replaced deprecated TSLint with ESLint
- 🎨 Demo now uses Vite instead of FuseBox (faster HMR, better DX)
- 🤖 GitHub Actions CI (replaced Travis CI)
- 🚀 Better Node.js 18+ compatibility
- 🧠 **Muse 3 (S Athena) Full Support**: 8-channel EEG, multi-channel PPG, IMU streaming with configurable presets
- 📹 **Demo Recording**: Save and export sensor data as JSON from the demo app

## Using in Node.js

The library uses the Web Bluetooth API directly. For Node.js support, you can use packages that provide Web Bluetooth compatibility, such as [@abandonware/noble](https://github.com/abandonware/noble) with a Web Bluetooth wrapper, or use the [muse-lsl project](https://github.com/urish/muse-lsl) which provides a working Node.js implementation.

## Muse 3 Usage

Muse 3 devices are automatically detected and use a different data streaming protocol. Key differences:

### Auto-Detection

The library automatically detects Muse 3 vs Classic Muse devices:

```javascript
const client = new MuseClient();
await client.connect();
console.log(client.deviceType); // 'Muse 3 (S Athena)' or 'Muse 1/2/S'
```

### Configurable Presets

Muse 3 supports multiple presets to balance performance and battery life:

```javascript
const client = new MuseClient();
await client.connect();

// Use default preset (p1035: 4 EEG + 4 PPG + IMU)
await client.start();

// Or specify a different preset
await client.start('p1041'); // Maximum data: 8 EEG + 16 PPG + IMU
```

### 8-Channel EEG

Muse 3 provides 8 EEG channels compared to 4-5 on Classic Muse:

```javascript
client.eegReadings.subscribe((reading) => {
  console.log(muse3ChannelNames[reading.electrode]); // TP9, AF7, AF8, TP10, FPz, AUX_R, AUX_L, AUX
  console.log(reading.samples); // 12 samples in microvolts
});
```

### PPG Support

Enable PPG to get photoplethysmography data (varies by preset):

```javascript
client.enablePpg = true; // Enable before connect()
await client.connect();
await client.start('p1035'); // 4 PPG channels

client.ppgReadings.subscribe((ppg) => {
  console.log(`Channel ${ppg.ppgChannel}:`, ppg.samples);
});
```

### Debug Mode

Enable detailed packet logging for troubleshooting:

```javascript
import { setMuse3DebugMode } from 'muse-js';

setMuse3DebugMode(true);
```

## Auxiliary Electrode

The Muse 2016 EEG headsets contains four electrodes, and you can connect an additional Auxiliary electrode through the Micro USB port. By default, muse-js does not read data from the Auxiliary electrode channel. You can change this behavior and enable the Auxiliary electrode by setting the `enableAux` property to `true`, just before calling the `connect` method:

```javascript
async function main() {
  let client = new MuseClient();
  client.enableAux = true;
  await client.connect();
}
```

## PPG (Photoplethysmography) / Optical Sensor

The Muse 2, Muse S, and Muse 3 contain PPG/optical sensors for heart rate and blood flow detection.

### PPG Channels

- **Muse 2**: ambient, infrared, red (3 channels)
- **Muse S**: infrared, green, unknown (3 channels) - unconfirmed
- **Muse 3**: varies by preset (4, 8, or 16 channels)

**Note**: PPG is not available on Muse 1/2016. Enabling PPG on incompatible devices may cause errors.

### Classic Muse (2/S) PPG Usage

```javascript
async function main() {
  let client = new MuseClient();
  client.enablePpg = true;  // Enable before connect()
  await client.connect();
  await client.start();      // Uses preset 'p50' automatically

  client.ppgReadings.subscribe((ppg) => {
    console.log(`Channel ${ppg.ppgChannel}: ${ppgChannelNames[ppg.ppgChannel]}`);
    console.log(ppg.samples); // 6 samples at 64 Hz
  });
}
```

### Muse 3 PPG Usage

```javascript
async function main() {
  let client = new MuseClient();
  client.enablePpg = true;  // Enable before connect()
  await client.connect();
  await client.start('p1035'); // 4 PPG channels
  // or client.start('p1041') for 16 PPG channels

  client.ppgReadings.subscribe((ppg) => {
    console.log(`PPG Channel ${ppg.ppgChannel}:`, ppg.samples);
  });
}
```

## Event Markers

For convenience, there is an `eventMarkers` stream included in `MuseClient` that you can use in order to introduce timestamped event markers into your project. Just subscribe to `eventMarkers` and use the `injectMarker` method with the value and optional timestamp of an event to send it through the stream.

```javascript
async function main() {
    let client = new MuseClient();
    client.eventMarkers.subscribe((event) => {
        console.log(event);
    });
    client.injectMarker("house")
    client.injectMarker("face")
    client.injectMarker("dog")
}
```

## Quick Reference

### Common Tasks

| Task | Code |
|------|------|
| Connect to device | `await client.connect()` |
| Start streaming | `await client.start()` or `await client.start('p1035')` |
| Subscribe to EEG | `client.eegReadings.subscribe(reading => {...})` |
| Enable PPG | `client.enablePpg = true` (before connect) |
| Subscribe to PPG | `client.ppgReadings.subscribe(ppg => {...})` |
| Enable Aux electrode | `client.enableAux = true` (before connect) |
| Subscribe to IMU | `client.accelerometerData.subscribe(...)` |
| Get device info | `await client.deviceInfo()` |
| Pause streaming | `await client.pause()` |
| Resume streaming | `await client.resume()` |
| Disconnect | `client.disconnect()` |
| Add event marker | `await client.injectMarker('stimulus')` |

### Data Rates

| Sensor | Classic Muse | Muse 3 | Samples per Reading |
|--------|--------------|--------|---------------------|
| EEG | 256 Hz | 256 Hz | 12 |
| PPG | 64 Hz | 64 Hz | 3-16 (preset dependent) |
| Accelerometer | 52 Hz | 52 Hz | 3 |
| Gyroscope | 52 Hz | 52 Hz | 3 |
| Telemetry | ~0.1 Hz | ~0.1 Hz | 1 |

### Channel Indices

**Classic Muse (1/2/S):**
- EEG: 0=TP9, 1=AF7, 2=AF8, 3=TP10, 4=AUX
- PPG: 0=ambient, 1=infrared, 2=red

**Muse 3:**
- EEG: 0=TP9, 1=AF7, 2=AF8, 3=TP10, 4=FPz, 5=AUX_R, 6=AUX_L, 7=AUX
- PPG: varies by preset (0-15)

## Projects using muse-js

* [EEGEdu](https://eegedu.com/) - Interactive Brain Playground. [Source code](https://github.com/kylemath/EEGEdu) using React, Polaris and chartjs.
* [EEG Explorer](https://muse-eeg-app.web.app/) - Visual EEG readings from the Muse EEG Headset. [Source code](https://github.com/urish/eeg-explorer) using Angular, Material Design and smoothie charts.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

For Muse 3 development status and implementation details, see [MUSE3_STATUS.md](./MUSE3_STATUS.md).

## License

MIT License - see [LICENSE](./LICENSE) file for details.
