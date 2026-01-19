# Muse 3 (S Athena) Implementation Status

This document tracks the implementation status of Muse 3 (Muse S Athena) support in muse-js.

## Device Specifications

**Muse S Athena** (Muse 3):
- **EEG Channels**: 8 channels (TP9, AF7, AF8, TP10, FPz, AUX_R, AUX_L, AUX) at 256 Hz, 14-bit resolution
- **Accelerometer**: 3-axis at 52Hz, 16-bit resolution, ±2G range
- **Gyroscope**: 3-axis at 52Hz, 16-bit resolution, ±250dps range
- **PPG Sensor**: Triple wavelength (IR 850nm, Near-IR 730nm, Red 660nm), 64 Hz, 20-bit resolution
- **fNIRS Sensor**: 5-optode bilateral frontal cortex hemodynamics, 64 Hz, 20-bit resolution
- **Bluetooth**: BLE 5.3, 2.4 GHz
- **Service UUID**: `0xfe8d` (same as Muse 1/2/S)

## Protocol Differences from Muse 1/2/S

### 1. Data Characteristics
Muse 3 uses different characteristics for data streaming:
- **EEG Data**: `273e0013-4c4d-454d-96be-f03bac821358` (vs 5 separate characteristics in Muse 1/2/S)
- **Other Sensors**: `273e0014-4c4d-454d-96be-f03bac821358` (IMU, PPG, telemetry)
- **Control**: `273e0001-4c4d-454d-96be-f03bac821358` (same as before)

### 2. Initialization Sequence
Muse 3 requires a different startup sequence:
1. Send `v6` (version query)
2. Send `s` (status query)
3. Send `h` (halt/reset)
4. Send preset command (e.g., `p1041`)
5. Enable notifications on data characteristics
6. Send `dc001` **TWICE** (critical!)
7. Optionally send `L1` (low-latency mode)

### 3. Presets

| Preset | EEG Channels | Optics | ACC/GYRO | Battery | LED |
|--------|--------------|--------|----------|---------|-----|
| p20, p21, p50, p51, p60, p61 | 4 | - | ✓ | ✓ | Off |
| p1034, p1043 | 8 | 8 channels | ✓ | ✓ | Bright |
| p1044 | 8 | 8 channels | ✓ | ✓ | Dim |
| p1035 | 4 | 4 channels | ✓ | ✓ | Dim |
| p1041, p1042 | 8 | 16 channels | ✓ | ✓ | Bright |
| p1045, p1046 | 8 | 4 channels | ✓ | ✓ | Dim |
| p4129 | 8 | 4 channels | ✓ | ✓ | Dim |

**Recommended preset**: `p1041` (full sensor mode with 8 EEG channels and 16 optics channels)

### 4. Packet Structure
Muse 3 uses different packet types:
- `0xDF`: Combined EEG + PPG data
- `0xF4`: IMU data (accelerometer + gyroscope)
- `0xDB`, `0xD9`: Mixed sensor data

## Implementation Status

### ✅ Completed
- [x] Added Muse 3 characteristic constants
- [x] Added device type enum (`MuseDeviceType`)
- [x] Added preset types
- [x] Added channel name mappings for 8-channel EEG
- [x] Documentation of protocol differences

### 🚧 In Progress / TODO
- [ ] **Device Detection**: Auto-detect Muse 3 vs Muse 1/2/S based on available characteristics
- [ ] **Connection Logic**: Implement Muse 3-specific connection sequence
  - [ ] Send `v6`, `s`, `h` commands
  - [ ] Apply preset
  - [ ] Send `dc001` twice
  - [ ] Optional `L1` for low-latency
- [ ] **Packet Parsing**: Decode Muse 3 packet formats
  - [ ] Parse `0xDF` packets (EEG + PPG)
  - [ ] Parse `0xF4` packets (IMU)
  - [ ] Parse `0xDB`, `0xD9` packets
- [ ] **Data Streaming**: Enable notifications on Muse 3 characteristics
  - [ ] Subscribe to `273e0013` (EEG)
  - [ ] Subscribe to `273e0014` (Other sensors)
- [ ] **TypeScript Interfaces**: Extend interfaces for 8-channel EEG
- [ ] **Testing**: Add tests for Muse 3
  - [ ] Mock Muse 3 device with web-bluetooth-mock
  - [ ] Test connection sequence
  - [ ] Test data parsing
  - [ ] Ensure backward compatibility with Muse 1/2/S

## Implementation Guide

### Step 1: Device Detection
Detect device type by attempting to read characteristics:
```typescript
async detectDeviceType(): Promise<MuseDeviceType> {
    try {
        await this.gatt.getPrimaryService(MUSE_SERVICE)
            .then(s => s.getCharacteristic(MUSE3_EEG_CHARACTERISTIC));
        return MuseDeviceType.MUSE_3;
    } catch {
        return MuseDeviceType.MUSE_1_2_S;
    }
}
```

### Step 2: Muse 3 Connection
Implement Muse 3-specific initialization:
```typescript
async connectMuse3(preset: MusePreset = 'p1041') {
    // Get control characteristic
    const controlChar = await service.getCharacteristic(CONTROL_CHARACTERISTIC);

    // Send initialization sequence
    await this.sendCommand(controlChar, 'v6');
    await this.delay(200);
    await this.sendCommand(controlChar, 's');
    await this.delay(200);
    await this.sendCommand(controlChar, 'h');
    await this.delay(200);
    await this.sendCommand(controlChar, preset);
    await this.delay(200);

    // Enable notifications
    const eegChar = await service.getCharacteristic(MUSE3_EEG_CHARACTERISTIC);
    const otherChar = await service.getCharacteristic(MUSE3_OTHER_CHARACTERISTIC);

    await eegChar.startNotifications();
    await otherChar.startNotifications();

    // Send start command TWICE (critical!)
    await this.sendCommand(controlChar, 'dc001');
    await this.delay(100);
    await this.sendCommand(controlChar, 'dc001');

    // Optional: low-latency mode
    await this.sendCommand(controlChar, 'L1');
}
```

### Step 3: Packet Parsing
Implement parsers for Muse 3 packet types (see `muse3/muse.py` for reference).

## Testing Requirements

1. **Unit Tests**: Mock Muse 3 device and test connection/parsing
2. **Integration Tests**: Test with real Muse 3 device
3. **Backward Compatibility**: Ensure Muse 1/2/S still works

## References

- [Amused-Py](https://github.com/Amused-EEG/amused-py) - First open-source Muse S implementation
- [OpenMuse](https://github.com/DominiqueMakowski/OpenMuse) - Python Muse S decoder
- [MuseAthenaDataformatParser](https://github.com/AbosaSzakal/MuseAthenaDataformatParser) - Data format documentation
- Muse 3 protocol documentation in `/muse3/` directory

## Contributing

To contribute Muse 3 support:
1. Implement device detection logic
2. Add Muse 3 initialization sequence
3. Implement packet parsers for new formats
4. Add comprehensive tests
5. Test with real Muse 3 device
6. Update documentation

## Notes

- The `dc001` command must be sent **twice** - this is critical and undocumented
- Muse 3 can operate in various presets with different sensor combinations
- Backward compatibility with Muse 1/2/S must be maintained
- The library should auto-detect device type and use appropriate protocol
