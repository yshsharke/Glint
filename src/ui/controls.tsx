import { Field, Dropdown, Option, Switch, useId } from '@fluentui/react-components';
import { ui, useAppState } from './state';
export function controlData(attributes: Record<`data-${string}`, string> & { 'aria-label'?: string }) {
  return { className: undefined, ...attributes };
}
export function Select({ label, value, options, onChange, field, actionField }: {
  label: string; value: string; options: string[][]; onChange: (value: string) => void; field?: string; actionField?: string;
}) {
  const id = useId('select');
  return <Field label={label} className="form-field"><Dropdown id={id}
    data-field={field} data-action-field={actionField} className="full-control"
    value={options.find(([key]) => key === value)?.[1] || value} selectedOptions={[value]}
    onOptionSelect={(_, data) => { if (data.optionValue) onChange(data.optionValue); }}>
    {options.map(([key, text]) => <Option key={key} value={key}>{text}</Option>)}
  </Dropdown></Field>;
}
export function SettingSwitch({ label, description, field }: { label: string; description: string; field: 'enabled' | 'clipboardFallback' }) {
  const { draft } = useAppState();
  const id = useId('switch');
  return <div className="switch-setting"><div><label htmlFor={id}>{label}</label><p>{description}</p></div>
    <Switch id={id} checked={draft[field]} input={controlData({ 'data-field': field })}
      onChange={(_, data) => ui.edit(draft => { draft[field] = data.checked; })} /></div>;
}
