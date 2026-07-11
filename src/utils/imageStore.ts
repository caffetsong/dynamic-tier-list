const DB_NAME = "dynamic-tier-list";
const DB_VERSION = 1;
const IMAGE_STORE = "images";
const MIGRATION_FLAG = "imageStoreMigratedV1";
const V2_MIGRATION_FLAG = "projectMigrationV2";

const IMAGE_HOLDER_KEY = "imageHolder";
const TIER_IMAGE_KEY_PREFIX = "tierImages_";
const ORIGINAL_IMAGE_KEY_PREFIX = "originalImage_";

let dbPromise: Promise<IDBDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;

interface ImageItem {
	id: number;
	url: string;
	text?: string;
}

interface OriginalImageItem {
	id: number;
	url: string;
}

export interface ImageResizeOptions {
	size: number;
	quality: number;
	pasteScaleMode: "fixed" | "preserve";
}

const nsKey = (namespace: string, key: string): string => {
	return `${namespace}_${key}`;
};

const openDatabase = (): Promise<IDBDatabase> => {
	if (dbPromise) {
		return dbPromise;
	}

	dbPromise = new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(IMAGE_STORE)) {
				db.createObjectStore(IMAGE_STORE);
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

	return dbPromise;
};

const withStore = async <T>(
	mode: IDBTransactionMode,
	handler: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
	const db = await openDatabase();

	return new Promise<T>((resolve, reject) => {
		const transaction = db.transaction(IMAGE_STORE, mode);
		const store = transaction.objectStore(IMAGE_STORE);
		const request = handler(store);

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
};

export const getAllStoreKeys = async (): Promise<string[]> => {
	const db = await openDatabase();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(IMAGE_STORE, "readonly");
		const store = transaction.objectStore(IMAGE_STORE);
		const request = store.getAllKeys();
		request.onsuccess = () => resolve(request.result as string[]);
		request.onerror = () => reject(request.error);
	});
};

export const getImageStore = async (namespace: string, key: string): Promise<ImageItem[]> => {
	const value = await withStore("readonly", (store) => store.get(nsKey(namespace, key)));
	return Array.isArray(value) ? (value as ImageItem[]) : [];
};

export const setImageStore = async (
	namespace: string,
	key: string,
	images: ImageItem[],
): Promise<void> => {
	await withStore("readwrite", (store) => store.put(images, nsKey(namespace, key)));
};

export const setOriginalImageData = async (
	namespace: string,
	image: OriginalImageItem,
): Promise<void> => {
	await withStore("readwrite", (store) =>
		store.put(image.url, nsKey(namespace, `${ORIGINAL_IMAGE_KEY_PREFIX}${image.id}`))
	);
};

export const getOriginalImageData = async (
	namespace: string,
	imageId: number,
): Promise<string | null> => {
	const value = await withStore("readonly", (store) =>
		store.get(nsKey(namespace, `${ORIGINAL_IMAGE_KEY_PREFIX}${imageId}`))
	);
	return typeof value === "string" ? value : null;
};

export const deleteOriginalImageData = async (
	namespace: string,
	imageId: number,
): Promise<void> => {
	await withStore("readwrite", (store) =>
		store.delete(nsKey(namespace, `${ORIGINAL_IMAGE_KEY_PREFIX}${imageId}`))
	);
};

export const deleteImageStore = async (namespace: string, key: string): Promise<void> => {
	await withStore("readwrite", (store) => store.delete(nsKey(namespace, key)));
};

const compressAndDownscaleImage = (
	base64: string,
	maxHeight: number,
	qualityPercent: number,
	shouldScale: boolean,
): Promise<string> => {
	return new Promise((resolve) => {
		const img = document.createElement("img");
		img.onload = () => {
			const canvas = document.createElement("canvas");
			const ctx = canvas.getContext("2d");
			if (!ctx || img.naturalWidth === 0 || img.naturalHeight === 0) {
				resolve(base64);
				return;
			}

			const scale = shouldScale ? maxHeight / img.naturalHeight : Math.min(1, maxHeight / img.naturalHeight);
			canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
			canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			const output = canvas.toDataURL("image/jpeg", qualityPercent / 100);
			resolve(output);
		};
		img.onerror = () => {
			resolve(base64);
		};
		img.src = base64;
	});
};

export const resizeImageDataUrl = async (
	base64: string,
	options: ImageResizeOptions,
): Promise<string> => {
	return compressAndDownscaleImage(
		base64,
		options.size,
		options.quality,
		options.pasteScaleMode === "fixed",
	);
};

export const resizeStoredImages = async (
	namespace: string,
	images: ImageItem[],
	options: ImageResizeOptions,
): Promise<ImageItem[]> => {
	return Promise.all(
		images.map(async (image) => {
			const originalImage = await getOriginalImageData(namespace, image.id);
			const source = originalImage ?? image.url;
			const resizedUrl = await resizeImageDataUrl(source, options);

			return {
				...image,
				url: resizedUrl,
			};
		}),
	);
};

export const getFullResolutionImages = async (
	namespace: string,
	images: ImageItem[],
): Promise<ImageItem[]> => {
	return Promise.all(
		images.map(async (image) => {
			const originalImage = await getOriginalImageData(namespace, image.id);

			return {
				...image,
				url: originalImage ?? image.url,
			};
		}),
	);
};

export const clearAllImageStores = async (namespace?: string): Promise<void> => {
	if (!namespace) {
		await withStore("readwrite", (store) => store.clear());
		return;
	}

	// Clear only keys matching the namespace prefix
	const allKeys = await getAllStoreKeys();
	const prefix = `${namespace}_`;
	const keysToDelete = allKeys.filter((key) => key.startsWith(prefix));

	for (const key of keysToDelete) {
		await withStore("readwrite", (store) => store.delete(key));
	}
};

const getTierImageKeysFromLocalStorage = (): string[] => {
	const keys: string[] = [];

	for (let i = 0; i < localStorage.length; i += 1) {
		const key = localStorage.key(i);
		if (key && key.startsWith(TIER_IMAGE_KEY_PREFIX)) {
			keys.push(key);
		}
	}

	return keys;
};

const parseStoredImages = (value: string | null): ImageItem[] => {
	if (!value) {
		return [];
	}

	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? (parsed as ImageItem[]) : [];
	} catch {
		return [];
	}
};

export const migrateImageStoresFromLocalStorage = async (namespace: string): Promise<void> => {
	if (migrationPromise) {
		return migrationPromise;
	}

	migrationPromise = (async () => {
		if (localStorage.getItem(MIGRATION_FLAG) === "true") {
			return;
		}

		const keysToMigrate = [
			IMAGE_HOLDER_KEY,
			...getTierImageKeysFromLocalStorage(),
		];

		for (const key of keysToMigrate) {
			const parsedImages = parseStoredImages(localStorage.getItem(key));
			if (parsedImages.length > 0) {
				await setImageStore(namespace, key, parsedImages);
				await Promise.all(
					parsedImages.map((image) =>
						setOriginalImageData(namespace, {
							id: image.id,
							url: image.url,
						})
					)
				);
			}

			if (localStorage.getItem(key) !== null) {
				localStorage.removeItem(key);
			}
		}

		localStorage.setItem(MIGRATION_FLAG, "true");
	})();

	return migrationPromise;
};

/**
 * One-time migration from un-namespaced IndexedDB keys to project-namespaced keys.
 * This copies all existing keys without "project_" prefix into the given namespace.
 */
const migrateIndexedDBToNamespace = async (namespace: string): Promise<void> => {
	const allKeys = await getAllStoreKeys();

	for (const key of allKeys) {
		// Skip keys that are already namespaced
		if (key.startsWith("project_")) continue;

		const value = await withStore("readonly", (store) => store.get(key));
		if (value !== undefined) {
			await withStore("readwrite", (store) => store.put(value, nsKey(namespace, key)));
		}
	}
};

/**
 * Full migration to the v2 project system.
 * - Migrates localStorage images to namespaced IndexedDB (if v1 not done)
 * - Copies existing un-namespaced IndexedDB keys to the default namespace
 * Returns the default namespace string.
 */
export const migrateToProjectSystem = async (namespace: string): Promise<void> => {
	if (localStorage.getItem(V2_MIGRATION_FLAG) === "true") {
		return;
	}

	// Step 1: Ensure v1 migration is done (localStorage images → IndexedDB)
	const v1Done = localStorage.getItem(MIGRATION_FLAG) === "true";

	if (!v1Done) {
		const keysToMigrate = [
			IMAGE_HOLDER_KEY,
			...getTierImageKeysFromLocalStorage(),
		];

		for (const key of keysToMigrate) {
			const parsedImages = parseStoredImages(localStorage.getItem(key));
			if (parsedImages.length > 0) {
				await setImageStore(namespace, key, parsedImages);
				await Promise.all(
					parsedImages.map((image) =>
						setOriginalImageData(namespace, {
							id: image.id,
							url: image.url,
						})
					)
				);
			}

			if (localStorage.getItem(key) !== null) {
				localStorage.removeItem(key);
			}
		}

		localStorage.setItem(MIGRATION_FLAG, "true");
	}

	// Step 2: Copy un-namespaced IndexedDB keys to namespaced versions
	await migrateIndexedDBToNamespace(namespace);

	localStorage.setItem(V2_MIGRATION_FLAG, "true");
};
