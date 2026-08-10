import { describe, expect, it } from 'vitest';
import { IPC, PUSH_CHANNELS, invokeChannelsOf } from './ipc';

const GROUPS = ['file', 'ops', 'stamp', 'ocr', 'redact', 'ai', 'app', 'raster'] as const;

function everyChannel(): string[] {
  return GROUPS.flatMap((group) => Object.values(IPC[group]));
}

describe('IPC channel constants', () => {
  it('declares every group named in the architecture doc', () => {
    expect(Object.keys(IPC).sort()).toEqual([...GROUPS].sort());
  });

  it('prefixes every channel with its own group name', () => {
    for (const group of GROUPS) {
      for (const channel of Object.values(IPC[group])) {
        expect(channel.startsWith(`${group}:`)).toBe(true);
      }
    }
  });

  it('has no duplicate channel names', () => {
    const all = everyChannel();
    expect(new Set(all).size).toBe(all.length);
  });

  it('classifies every channel as invokable or push/send, never both', () => {
    const invokable = GROUPS.flatMap((group) => invokeChannelsOf(group)) as string[];
    const nonInvokable = [...PUSH_CHANNELS, IPC.raster.response] as string[];

    expect([...invokable, ...nonInvokable].sort()).toEqual(everyChannel().sort());
    expect(invokable.filter((channel) => nonInvokable.includes(channel))).toEqual([]);
  });
});

describe('invokeChannelsOf', () => {
  it('excludes the progress channel from an ops registration list', () => {
    expect(invokeChannelsOf('ops')).not.toContain(IPC.ops.progress);
    expect(invokeChannelsOf('ops')).toContain(IPC.ops.merge);
  });

  it('leaves the raster group with no invokable channels', () => {
    expect(invokeChannelsOf('raster')).toEqual([]);
  });
});
