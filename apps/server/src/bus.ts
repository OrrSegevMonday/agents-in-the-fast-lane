import { EventEmitter } from 'node:events';
import type { StreamEvent } from '@aj/shared';

class Bus extends EventEmitter {
  publish(event: StreamEvent) {
    this.emit('event', event);
  }

  subscribe(listener: (event: StreamEvent) => void) {
    this.on('event', listener);
    return () => this.off('event', listener);
  }
}

export const bus = new Bus();
bus.setMaxListeners(100);
