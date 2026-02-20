'use strict';

const { session } = require('electron');

class ProfileManager {
  constructor() {
    /** @type {Map<string, { partition: string, proxy: string|null, userAgent: string|null }>} */
    this._profiles = new Map();
  }

  /**
   * Create or get a session partition for a profileId.
   */
  create(profileId, options = {}) {
    const partition = `persist:${profileId}`;
    const ses = session.fromPartition(partition);

    // Apply proxy if provided
    if (options.proxy) {
      ses.setProxy({ proxyRules: options.proxy }).catch(() => {});
    }

    const profile = {
      partition,
      proxy: options.proxy || null,
      userAgent: options.userAgent || null,
      session: ses,
    };
    this._profiles.set(profileId, profile);
    return profile;
  }

  /**
   * Get profile info.
   */
  get(profileId) {
    return this._profiles.get(profileId) || null;
  }

  /**
   * List all profile IDs.
   */
  list() {
    return Array.from(this._profiles.keys());
  }

  /**
   * Destroy a profile – clear all storage data.
   */
  async destroy(profileId) {
    const profile = this._profiles.get(profileId);
    if (!profile) return;
    try {
      await profile.session.clearStorageData();
      await profile.session.clearCache();
      await profile.session.clearAuthCache();
    } catch {
      // ignore
    }
    this._profiles.delete(profileId);
  }

  /**
   * Destroy all profiles.
   */
  async cleanup() {
    const ids = this.list();
    for (const id of ids) {
      await this.destroy(id);
    }
  }
}

module.exports = ProfileManager;
