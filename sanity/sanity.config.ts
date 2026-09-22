import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'Tell Me More - Xu Neng Demo',

  projectId: '3tdecpiq',
  dataset: 'production',

  plugins: [structureTool()],
  document: {actions: () => [], newDocumentOptions: () => []},

  schema: {
    types: schemaTypes,
  },
})
