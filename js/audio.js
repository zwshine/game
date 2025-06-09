// js/audio.js
const audioManager = {
    sounds: {}, // To store Audio elements

    /**
     * Loads a sound and stores it for later use.
     * @param {string} key - A unique identifier for the sound.
     * @param {string} path - The path to the audio file, relative to the HTML file.
     * @param {string} [preload='auto'] - The preload attribute for the audio element.
     */
    load(key, path, preload = 'auto') {
        if (this.sounds[key]) return;
        const audio = new Audio(path);
        audio.preload = preload;
        this.sounds[key] = audio;
    },

    /**
     * Plays a preloaded sound.
     * @param {string} key - The identifier of the sound to play.
     */
    play(key) {
        const sound = this.sounds[key];
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.error(`Audio play failed for key '${key}':`, e));
        } else {
            console.warn(`Sound with key '${key}' not loaded.`);
        }
    }
}; 