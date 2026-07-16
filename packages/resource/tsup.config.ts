import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    nest: 'src/nest.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['jose', '@nestjs/common', '@nestjs/core'],
  treeshake: true,
})
