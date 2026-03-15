import { resolve } from 'node:path';
import { PythonBridge } from '@interceptor/shared';

let instance: PythonBridge | null = null;

export async function getBridge(): Promise<PythonBridge> {
	if (instance?.isConnected()) return instance;

	instance = new PythonBridge({
		workerPath: resolve(import.meta.dirname, '../../../services/python/worker.py'),
	});
	await instance.start();
	return instance;
}
