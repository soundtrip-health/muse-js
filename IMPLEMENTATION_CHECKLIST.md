# Implementation Checklist

This document tracks remaining work for muse-js v4.0.

## 🐛 Priority 1: Fix Classic Muse Issues

### Debug Accelerometer Data
- [ ] **Investigate accelerometer data format**
  - Current status: Connection works but data appears invalid
  - Check if data is being parsed correctly in `src/lib/muse-parse.ts:parseAccelerometer()`
  - Verify the sample indexing (currently uses `accel.samples[2]` in demo)
  - Test with actual Muse 1/2/S device and log raw data
  - Compare with expected data format from Muse SDK documentation

- [ ] **Add accelerometer data logging**
  - Add console.log to see raw accelerometer packets
  - Check if samples array has expected structure
  - Verify XYZ values are in correct range (-2G to +2G)

- [ ] **Fix accelerometer parsing if needed**
  - Update `parseAccelerometer()` function if format is incorrect
  - Add data validation and bounds checking
  - Test with device movement to verify readings

### Enhance Demo Application

- [ ] **Add Gyroscope Visualization**
  - Add UI section for gyroscope data (X, Y, Z rotation)
  - Subscribe to `client.gyroscopeData` in demo
  - Display rotation rates in degrees/second
  - Normalize values: `(v / 32.768).toFixed(2) + '°/s'` (±250dps range)

- [ ] **Add PPG/Heart Rate Support**
  - Add checkbox to enable PPG before connecting
  - Set `client.enablePpg = true` when checked
  - Add UI section for PPG data display
  - Subscribe to `client.ppgReadings`
  - Display all 3 channels (ambient, infrared, red)
  - Add simple heart rate calculation from PPG signal

- [ ] **Improve Demo Layout**
  - Organize sensor sections: EEG | Motion (Accel/Gyro) | PPG
  - Add enable/disable toggles for each sensor type
  - Show data update rates for each sensor
  - Add connection quality indicators

- [ ] **Add Data Export/Recording**
  - Add button to start/stop recording
  - Export data as CSV or JSON
  - Include timestamps for all samples
  - Allow downloading recorded session

## 🚀 Priority 2: Complete Muse 3 Implementation

### Device Connection & Initialization

- [ ] **Implement Muse 3 startup sequence**
  - Send `v6` command (version query)
  - Send `s` command (status query)
  - Send `h` command (halt/reset)
  - Send preset command (e.g., `p1041` for full sensors)
  - **CRITICAL**: Send `dc001` command TWICE (undocumented requirement!)
  - Optionally send `L1` for low-latency mode
  - Add delays between commands (200ms recommended)

- [ ] **Add preset selection**
  - Allow user to choose preset in demo UI
  - Default to `p1041` (EEG8 + Optics16 + ACC/GYRO + Battery)
  - Document what each preset enables (see MUSE3_IMPLEMENTATION.md)

### Characteristic Subscription

- [ ] **Subscribe to Muse 3 data characteristics**
  ```typescript
  // After device detection, if Muse 3:
  const muse3EegChar = await service.getCharacteristic(_MUSE3_EEG_CHARACTERISTIC);
  const muse3OtherChar = await service.getCharacteristic(_MUSE3_OTHER_CHARACTERISTIC);

  await muse3EegChar.startNotifications();
  await muse3OtherChar.startNotifications();
  ```

- [ ] **Create observables for Muse 3 data**
  - Setup observable for EEG characteristic
  - Setup observable for Other characteristic
  - Use `observableCharacteristic()` helper function
  - Pipe data through appropriate parsers

### Data Parsing Implementation

- [ ] **Implement Muse 3 packet identification**
  - Read first byte to identify packet type
  - `0xDF`: EEG + PPG combined
  - `0xF4`: IMU (accelerometer + gyroscope)
  - `0xDB`, `0xD9`: Mixed sensor data
  - Log unknown packet types for investigation

- [ ] **Implement 0xDF packet parser (EEG + PPG)**
  - Parse 8-channel EEG data (TP9, AF7, AF8, TP10, FPz, AUX_R, AUX_L, AUX)
  - Parse PPG data (up to 16 channels depending on preset)
  - Extract timestamps
  - Create `EEGReading` objects for each channel
  - Create `PPGReading` objects for each PPG channel
  - Reference: `muse3/muse.py` for packet structure

- [ ] **Implement 0xF4 packet parser (IMU)**
  - Parse 3-axis accelerometer data
  - Parse 3-axis gyroscope data
  - Sample rate: 52 Hz
  - Resolution: 16-bit
  - Create `AccelerometerData` and `GyroscopeData` objects

- [ ] **Implement 0xDB/0xD9 packet parsers**
  - Analyze packet structure from captured data
  - Parse mixed sensor data
  - Map to appropriate data types

- [ ] **Add battery/telemetry parsing for Muse 3**
  - Determine if battery info is in `0xF4` or other packets
  - Parse battery percentage
  - Parse temperature if available
  - Create `TelemetryData` objects

### Testing & Validation

- [ ] **Test with real Muse 3 device**
  - Verify connection and initialization
  - Capture raw packet data for analysis
  - Test all presets (p1041, p1035, p1034, etc.)
  - Verify EEG data is valid (8 channels at 256 Hz)
  - Verify PPG data is valid (64 Hz, 20-bit)
  - Verify IMU data is valid (52 Hz, 16-bit)

- [ ] **Add Muse 3 unit tests**
  - Mock Muse 3 device with web-bluetooth-mock
  - Test device detection logic
  - Test packet parsing functions
  - Test data streaming observables
  - Ensure backward compatibility with Muse 1/2/S

- [ ] **Validate data quality**
  - Compare with official Muse SDK output
  - Verify timestamps are accurate
  - Check for dropped packets or data gaps
  - Test sustained streaming (5+ minutes)

### Demo Enhancements for Muse 3

- [ ] **Add Muse 3-specific UI**
  - Show 8 EEG channels instead of 5
  - Update channel labels (add FPz, AUX_R, AUX_L)
  - Display expanded PPG channels (up to 16)
  - Show preset selection and status

- [ ] **Add fNIRS visualization**
  - Muse 3 has 5-optode bilateral frontal cortex hemodynamics
  - Display hemodynamic data if available
  - Show blood oxygenation levels

## 📚 Priority 3: Documentation & Polish

### Update Documentation

- [ ] **Update README.md**
  - Mark Muse 3 as "Fully Supported" when complete
  - Add Muse 3 usage examples
  - Document preset selection
  - Add troubleshooting section

- [ ] **Create CHANGELOG.md**
  - Document all changes in v4.0
  - List breaking changes
  - Add migration guide from v3.x

- [ ] **Add API documentation**
  - Generate with TypeDoc
  - Document all public methods
  - Add code examples
  - Host on GitHub Pages

- [ ] **Create usage examples**
  - Basic EEG streaming
  - Recording session data
  - Real-time signal processing
  - Muse 3 preset selection
  - Node.js usage example

### Code Quality

- [ ] **Add ESLint rule exceptions where needed**
  - Fix remaining `any` type warnings
  - Add proper type annotations
  - Document complex algorithms

- [ ] **Improve error handling**
  - Add specific error types
  - Provide helpful error messages
  - Handle edge cases gracefully

- [ ] **Performance optimization**
  - Profile data streaming performance
  - Optimize packet parsing
  - Reduce memory allocations

## 🧪 Testing Plan

### Manual Testing Checklist

#### Muse 1/2/S (Classic)
- [ ] Test connection to Muse 1
- [ ] Test connection to Muse 2
- [ ] Test connection to Muse S (classic)
- [ ] Verify 4-channel EEG streaming
- [ ] Verify 5-channel EEG with AUX enabled
- [ ] Verify accelerometer data (fix if broken)
- [ ] Verify gyroscope data
- [ ] Verify telemetry (battery, temperature)
- [ ] Verify PPG streaming (Muse 2/S only)
- [ ] Test device info retrieval
- [ ] Test event markers

#### Muse 3 (S Athena)
- [ ] Test connection to Muse 3
- [ ] Verify 8-channel EEG streaming
- [ ] Verify all presets work
- [ ] Verify PPG streaming (multi-channel)
- [ ] Verify IMU data (accelerometer + gyroscope)
- [ ] Verify battery/telemetry data
- [ ] Test sustained streaming (10+ minutes)
- [ ] Test device info retrieval
- [ ] Test event markers

### Browser Compatibility
- [ ] Test on Chrome (desktop)
- [ ] Test on Edge (desktop)
- [ ] Test on Opera (desktop)
- [ ] Test on Chrome (Android)
- [ ] Document browser requirements

### Node.js Testing
- [ ] Test with @abandonware/noble
- [ ] Create Node.js example
- [ ] Test on macOS
- [ ] Test on Linux
- [ ] Test on Windows (if possible)

## 📦 Release Preparation

- [ ] **Version 4.0.0 Release**
  - Update package.json version
  - Create Git tag
  - Build and test final package
  - Publish to npm
  - Create GitHub Release with changelog

- [ ] **Announce Release**
  - Post on GitHub Discussions
  - Update project website (if any)
  - Share with Muse community

## 🔍 Investigation Notes

### Accelerometer Issue Debug Steps
1. Add logging to capture raw accelerometer packets
2. Log the parsed `AccelerometerData` structure
3. Compare with Muse SDK expected format
4. Check if normalization factor (16384) is correct
5. Verify sample array structure and indexing
6. Test with physical device movement

### Reference Implementation
- Check `muse3/muse.py` for Python implementation
- Review `muse3/AMUSED_README.md` for protocol details
- Review `muse3/OPEN_MUSE_README.md` for packet formats

## ✅ Completed
- ✅ Migrate TSLint → ESLint
- ✅ Update TypeScript 2.8 → 5.7
- ✅ Update Jest 22 → 29
- ✅ Update RxJS to 7.x
- ✅ Add dual ESM/CJS builds with tsup
- ✅ Migrate demo from FuseBox to Vite
- ✅ Migrate Travis CI → GitHub Actions
- ✅ Update Husky to modern version
- ✅ Add Muse 3 device detection
- ✅ Handle missing characteristics gracefully
- ✅ Fix control response JSON parsing
- ✅ Muse 3 basic connection working
- ✅ Device info display for Muse 3

---

**Last Updated:** 2026-01-19
**Version:** 4.0.0-beta
