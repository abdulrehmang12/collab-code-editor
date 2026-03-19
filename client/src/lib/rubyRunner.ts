import * as RubyWasm from '@ruby/wasm-wasi'

let rubyPromise: Promise<any> | null = null

async function getRubyVM() {
  if (!rubyPromise) {
    rubyPromise = (async () => {
      const response = await fetch('https://cdn.jsdelivr.net/npm/@ruby/wasm-wasi@2.1.0/dist/ruby.wasm')
      const buffer = await response.arrayBuffer()
      const module = await WebAssembly.compile(buffer)
      const service = (RubyWasm as any).DefaultRubyVM?.getService?.()
      if (!service) {
        throw new Error('Ruby WASM runtime is not available in this build')
      }
      const { vm } = await service.init(module)
      return vm
    })()
  }
  return rubyPromise
}

export async function runRuby(code: string): Promise<{ stdout: string; error?: string }> {
  try {
    const vm = await getRubyVM()
    const result = vm.eval(`
      require "stringio"
      $stdout = StringIO.new
      $stderr = $stdout
      begin
        ${code}
      rescue => e
        puts e.message
        puts e.backtrace
      end
      $stdout.string
    `)

    return { stdout: result.toString() }
  } catch (e: any) {
    return { stdout: '', error: String(e?.message || e) }
  }
}
