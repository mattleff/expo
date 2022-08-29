import * as Log from '../../../log';
import { DeviceManager } from '../DeviceManager';
import { PlatformManager } from '../PlatformManager';

// NOTE(Bacon): An extremely self contained system for testing the majority of the complex 'open in device' logic.
jest.mock(`../../../log`);
jest.mock('../ExpoGoInstaller');
jest.mock('@expo/config', () => ({
  getConfig: jest.fn(() => ({
    pkg: {},
    exp: {
      sdkVersion: '45.0.0',
      name: 'my-app',
      slug: 'my-app',
    },
  })),
}));

describe('openAsync', () => {
  // Mock haven
  function createManager({
    customUrl = 'custom://path',
    interstitialUrl = null,
    isAppInstalled = true,
  } = {}) {
    const getExpoGoUrl = jest.fn(() => 'exp://localhost:19000/');
    const getDevServerUrl = jest.fn(() => 'http://localhost:19000/');
    const getCustomRuntimeUrl = jest.fn(() => customUrl);
    const getInterstitialPageUrl = jest.fn(() => interstitialUrl);
    const device = {
      name: 'iPhone 13',
      logOpeningUrl: jest.fn(),
      ensureExpoGoAsync: jest.fn(),
      activateWindowAsync: jest.fn(),
      openUrlAsync: jest.fn(),
      isAppInstalledAsync: jest.fn(async () => isAppInstalled),
    } as unknown as DeviceManager<unknown>;
    const resolveDeviceAsync = jest.fn(async () => device);

    const manager = new PlatformManager('/', {
      platform: 'ios',
      resolveDeviceAsync,
      getCustomRuntimeUrl,
      getDevServerUrl,
      getExpoGoUrl,
      getInterstitialPageUrl,
    });

    // @ts-expect-error
    manager._getAppIdResolver = jest.fn(() => ({
      getAppIdAsync: jest.fn(() => 'dev.bacon.app'),
    }));
    return {
      manager,
      device,
      resolveDeviceAsync,
      getCustomRuntimeUrl,
      getDevServerUrl,
      getExpoGoUrl,
      getInterstitialPageUrl,
    };
  }

  it(`asserts invalid runtime`, async () => {
    const { manager } = createManager();
    await expect(manager.openAsync({ runtime: 'invalid' } as any)).rejects.toThrow(
      /Invalid runtime/
    );
  });

  it(`opens a project in Expo Go`, async () => {
    const { manager, getExpoGoUrl, device, resolveDeviceAsync } = createManager();

    const url = 'exp://localhost:19000/';
    expect(await manager.openAsync({ runtime: 'expo' })).toStrictEqual({
      url,
    });

    expect(resolveDeviceAsync).toHaveBeenCalledTimes(1);
    expect(getExpoGoUrl).toHaveBeenCalledTimes(1);

    expect(device.activateWindowAsync).toHaveBeenCalledTimes(1);
    expect(device.ensureExpoGoAsync).toHaveBeenCalledTimes(1);
    expect(device.ensureExpoGoAsync).toHaveBeenNthCalledWith(1, '45.0.0');
    expect(device.openUrlAsync).toHaveBeenNthCalledWith(1, url);

    // Logging
    expect(device.logOpeningUrl).toHaveBeenNthCalledWith(1, url);
    expect(Log.warn).toHaveBeenCalledTimes(0);
    expect(Log.error).toHaveBeenCalledTimes(0);
  });

  it(`opens a project interstitial page when dev build is installed`, async () => {
    const url = 'http://localhost:19000/_expo/loading';
    const { manager, getInterstitialPageUrl, device, resolveDeviceAsync } = createManager({
      interstitialUrl: url,
      isAppInstalled: true,
    });

    expect(await manager.openAsync({ runtime: 'expo' })).toStrictEqual({
      url,
    });

    expect(resolveDeviceAsync).toHaveBeenCalledTimes(1);
    expect(getInterstitialPageUrl).toHaveBeenCalledTimes(1);

    // Both Expo Go and dev build are checked
    expect(device.ensureExpoGoAsync).toHaveBeenCalledTimes(1);
    expect(device.isAppInstalledAsync).toHaveBeenCalledTimes(1);
    expect(device.isAppInstalledAsync).toHaveBeenNthCalledWith(1, 'dev.bacon.app');

    expect(device.activateWindowAsync).toHaveBeenCalledTimes(1);
    expect(device.openUrlAsync).toHaveBeenNthCalledWith(1, url);

    // Logging
    expect(device.logOpeningUrl).toHaveBeenNthCalledWith(1, url);
    expect(Log.warn).toHaveBeenCalledTimes(0);
    expect(Log.error).toHaveBeenCalledTimes(0);
  });

  it(`skips interstitial page when dev build is not installed`, async () => {
    const interstitialUrl = 'http://localhost:19000/_expo/loading';
    const { manager, getInterstitialPageUrl, device, resolveDeviceAsync } = createManager({
      interstitialUrl,
      isAppInstalled: false,
    });

    const expoGoUrl = 'exp://localhost:19000/';
    expect(await manager.openAsync({ runtime: 'expo' })).toStrictEqual({
      url: expoGoUrl,
    });

    expect(resolveDeviceAsync).toHaveBeenCalledTimes(1);
    expect(getInterstitialPageUrl).toHaveBeenCalledTimes(1);

    // Both Expo Go and dev build are checked
    expect(device.ensureExpoGoAsync).toHaveBeenCalledTimes(1);
    expect(device.isAppInstalledAsync).toHaveBeenCalledTimes(1);
    expect(device.isAppInstalledAsync).toHaveBeenNthCalledWith(1, 'dev.bacon.app');

    expect(device.activateWindowAsync).toHaveBeenCalledTimes(1);
    expect(device.openUrlAsync).toHaveBeenNthCalledWith(1, expoGoUrl);

    // Logging
    expect(device.logOpeningUrl).toHaveBeenNthCalledWith(1, expoGoUrl);

    // Should warn about skipping interstitial page and opening in Expo Go
    expect(Log.warn).toHaveBeenCalledTimes(1);
    expect(Log.error).toHaveBeenCalledTimes(0);
  });

  it(`opens a project in a web browser`, async () => {
    const { manager, getDevServerUrl, device, resolveDeviceAsync } = createManager();

    const url = 'http://localhost:19000/';
    expect(await manager.openAsync({ runtime: 'web' })).toStrictEqual({
      url,
    });

    expect(resolveDeviceAsync).toHaveBeenCalledTimes(1);
    expect(getDevServerUrl).toHaveBeenCalledTimes(1);

    // Expo Go is not checked
    expect(device.ensureExpoGoAsync).toHaveBeenCalledTimes(0);

    expect(device.activateWindowAsync).toHaveBeenCalledTimes(1);
    expect(device.openUrlAsync).toHaveBeenNthCalledWith(1, url);

    // Logging
    expect(device.logOpeningUrl).toHaveBeenNthCalledWith(1, url);
    expect(Log.warn).toHaveBeenCalledTimes(0);
    expect(Log.error).toHaveBeenCalledTimes(0);
  });

  it(`opens a project in a custom development client`, async () => {
    const url = 'custom://path';
    const { manager, getCustomRuntimeUrl, device, resolveDeviceAsync } = createManager({
      customUrl: url,
      isAppInstalled: true,
    });

    expect(await manager.openAsync({ runtime: 'custom' })).toStrictEqual({
      url,
    });

    expect(resolveDeviceAsync).toHaveBeenCalledTimes(1);
    expect(getCustomRuntimeUrl).toHaveBeenCalledTimes(1);

    // Expo Go is not checked
    expect(device.ensureExpoGoAsync).toHaveBeenCalledTimes(0);

    // But does check the custom dev client
    expect(device.isAppInstalledAsync).toHaveBeenCalledTimes(1);
    expect(device.isAppInstalledAsync).toHaveBeenNthCalledWith(1, 'dev.bacon.app');

    expect(device.activateWindowAsync).toHaveBeenCalledTimes(1);
    expect(device.openUrlAsync).toHaveBeenNthCalledWith(1, url);

    // Logging
    expect(device.logOpeningUrl).toHaveBeenNthCalledWith(1, url);
    expect(Log.warn).toHaveBeenCalledTimes(0);
    expect(Log.error).toHaveBeenCalledTimes(0);
  });

  it(`rejects when a required custom development client is not installed`, async () => {
    const url = 'custom://path';
    const { manager, getCustomRuntimeUrl, device, resolveDeviceAsync } = createManager({
      customUrl: url,
      isAppInstalled: false,
    });

    await expect(manager.openAsync({ runtime: 'custom' })).rejects.toThrow(
      /No development build \(dev\.bacon\.app\) for this project is installed/
    );

    expect(resolveDeviceAsync).toHaveBeenCalledTimes(1);
    expect(getCustomRuntimeUrl).toHaveBeenCalledTimes(1);

    // Expo Go is not checked
    expect(device.ensureExpoGoAsync).toHaveBeenCalledTimes(0);

    // But does check the custom dev client
    expect(device.isAppInstalledAsync).toHaveBeenCalledTimes(1);
    expect(device.isAppInstalledAsync).toHaveBeenNthCalledWith(1, 'dev.bacon.app');

    expect(device.activateWindowAsync).toHaveBeenCalledTimes(0);
    expect(device.openUrlAsync).toHaveBeenCalledTimes(0);

    // Logging
    expect(device.logOpeningUrl).toHaveBeenCalledTimes(0);
    expect(Log.warn).toHaveBeenCalledTimes(0);
    expect(Log.error).toHaveBeenCalledTimes(0);
  });

  it(`opens a project in a custom development client using app identifier`, async () => {
    const url = 'dev.bacon.app';
    const { manager, getCustomRuntimeUrl, device, resolveDeviceAsync } = createManager({
      // Return no custom url -- this happens when a dev client is not installed or the scheme cannot be resolved (like during run commands).
      customUrl: null,
      isAppInstalled: true,
    });
    // Bundle identifier is used instead of URL...
    manager._resolveAlternativeLaunchUrl = jest.fn(() => url);

    expect(await manager.openAsync({ runtime: 'custom' })).toStrictEqual({
      url,
    });

    expect(resolveDeviceAsync).toHaveBeenCalledTimes(1);
    expect(getCustomRuntimeUrl).toHaveBeenCalledTimes(1);

    // Expo Go is not checked
    expect(device.ensureExpoGoAsync).toHaveBeenCalledTimes(0);

    // But does check the custom dev client
    expect(device.isAppInstalledAsync).toHaveBeenCalledTimes(1);
    expect(device.isAppInstalledAsync).toHaveBeenNthCalledWith(1, 'dev.bacon.app');

    expect(device.activateWindowAsync).toHaveBeenCalledTimes(1);
    expect(device.openUrlAsync).toHaveBeenNthCalledWith(1, url);

    expect(manager._resolveAlternativeLaunchUrl).toBeCalledTimes(1);

    // Logging
    expect(device.logOpeningUrl).toHaveBeenNthCalledWith(1, url);
    expect(Log.warn).toHaveBeenCalledTimes(0);
    expect(Log.error).toHaveBeenCalledTimes(0);
  });
});
