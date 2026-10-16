/* llm-worker.js — встроенная модель ИИ (WebLLM, Apache-2.0) в отдельном потоке: страница не замирает,
   пока модель считает на видеочипе телефона (WebGPU). */
import {WebWorkerMLCEngineHandler} from '../vendor/web-llm.js';
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = m => handler.onmessage(m);
