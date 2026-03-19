import { LuaFactory } from 'wasmoon';

let luaPromise: Promise<any> | null = null;
const factory = new LuaFactory();

async function getLuaEngine() {
  if (!luaPromise) {
    luaPromise = factory.createEngine();
  }
  return luaPromise;
}

export async function runLua(code: string): Promise<{ stdout: string; error?: string }> {
  const logs: string[] = [];
  try {
    const lua = await getLuaEngine();

    // Hook print function in Lua to capture output
    lua.global.set('print', (...args: any[]) => {
      logs.push(args.map(String).join('\t'));
    });

    await lua.doString(code);
    return { stdout: logs.join('\n') };
  } catch (e: any) {
    return { stdout: logs.join('\n'), error: String(e?.message || e) };
  }
}
