import { MAX_GEOMETRY_VALUES, WATER_GEOMETRY_ABI } from './waterGeometryPacket'

interface GeometryExports {
  memory: WebAssembly.Memory
  abi_version: () => number
  reserve_input: (length: number) => number
  calculate: () => number
  output_ptr: () => number
  output_len: () => number
}

export async function instantiateWaterGeometry(bytes: BufferSource) {
  const { instance } = await WebAssembly.instantiate(bytes)
  const api = instance.exports as unknown as GeometryExports
  if (!(api.memory instanceof WebAssembly.Memory) || typeof api.abi_version !== 'function'
    || api.abi_version() !== WATER_GEOMETRY_ABI
    || ['reserve_input', 'calculate', 'output_ptr', 'output_len'].some(name => typeof instance.exports[name] !== 'function')) throw new Error('geometry ABI')
  return {
    calculate(input: Float64Array): Float64Array<ArrayBuffer> {
      if (input.length === 0 || input.length > MAX_GEOMETRY_VALUES) throw new Error('geometry size')
      const pointer = api.reserve_input(input.length)
      if (!pointer) throw new Error('geometry allocation')
      new Float64Array(api.memory.buffer, pointer, input.length).set(input)
      if (api.calculate() !== 1) throw new Error('geometry packet')
      // Rust may grow memory during calculation. Recreate the view and copy the
      // result before its next invocation replaces the module-owned buffer.
      return new Float64Array(new Float64Array(api.memory.buffer, api.output_ptr(), api.output_len()))
    },
  }
}
