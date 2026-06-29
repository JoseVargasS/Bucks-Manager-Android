import { registerHooks } from "node:module";

export const secureStoreMock = {
  values: new Map(),
  getError: null,
  setError: null,
  deleteError: null,
  reset() {
    this.values.clear();
    this.getError = null;
    this.setError = null;
    this.deleteError = null;
  },
  async getItemAsync(key) {
    if (this.getError) throw this.getError;
    return this.values.get(key) ?? null;
  },
  async setItemAsync(key, value) {
    if (this.setError) throw this.setError;
    this.values.set(key, value);
  },
  async deleteItemAsync(key) {
    if (this.deleteError) throw this.deleteError;
    this.values.delete(key);
  },
};

export const fileSystemMock = {
  files: new Map(),
  writeError: null,
  reset() {
    this.files.clear();
  },
  async getInfoAsync(path) {
    return { exists: this.files.has(path) };
  },
  async readAsStringAsync(path) {
    if (!this.files.has(path)) throw new Error(`Missing mock file: ${path}`);
    return this.files.get(path);
  },
  async writeAsStringAsync(path, value) {
    if (this.writeError) throw this.writeError;
    this.files.set(path, value);
  },
  async deleteAsync(path) {
    this.files.delete(path);
  },
};

globalThis.__bucksSecureStoreMock = secureStoreMock;
globalThis.__bucksFileSystemMock = fileSystemMock;

const moduleUrl = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
const secureStoreUrl = moduleUrl(`
  const mock = () => globalThis.__bucksSecureStoreMock;
  export const getItemAsync = (...args) => mock().getItemAsync(...args);
  export const setItemAsync = (...args) => mock().setItemAsync(...args);
  export const deleteItemAsync = (...args) => mock().deleteItemAsync(...args);
`);
const fileSystemUrl = moduleUrl(`
  const mock = () => globalThis.__bucksFileSystemMock;
  export const documentDirectory = "mock://document/";
  export const cacheDirectory = "mock://cache/";
  export const getInfoAsync = (...args) => mock().getInfoAsync(...args);
  export const readAsStringAsync = (...args) => mock().readAsStringAsync(...args);
  export const writeAsStringAsync = (...args) => mock().writeAsStringAsync(...args);
  export const deleteAsync = (...args) => mock().deleteAsync(...args);
`);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "expo-secure-store") return { url: secureStoreUrl, shortCircuit: true };
    if (specifier === "expo-file-system/legacy") return { url: fileSystemUrl, shortCircuit: true };
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".")) return nextResolve(`${specifier}.ts`, context);
      throw error;
    }
  },
});
