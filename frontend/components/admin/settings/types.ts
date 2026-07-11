export type SettingSource = 'db' | 'env' | 'default'

export type SettingType = 'flag' | 'duration' | 'csv' | 'text'

/** One operator-tunable setting, as returned by GET /admin/settings. */
export interface SettingView {
  key: string
  group: string
  label: string
  description: string
  type: SettingType
  secret: boolean
  /** Effective value (DB → env → default); null for secrets. */
  value: string | null
  isSet: boolean
  source: SettingSource
}
