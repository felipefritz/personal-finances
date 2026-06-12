import { Autocomplete, TextField, createFilterOptions } from '@mui/material';
import { Category } from '../../types';

interface Props {
  categories: Category[];
  value?: number | null;
  onChange: (id: number | null) => void;
  label?: string;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  allowClear?: boolean;
}

const filter = createFilterOptions<Category>();

export default function CategoryAutocomplete({
  categories,
  value,
  onChange,
  label = 'Categoría',
  size = 'small',
  fullWidth = true,
  allowClear = true,
}: Props) {
  const selected = categories.find((c) => c.id === value) ?? null;

  // MUI groupBy requires options to be sorted so same-group items are contiguous.
  // Sort by parent name first (or own name if root), then by item name within the group.
  const sortedCategories = [...categories].sort((a, b) => {
    const parentA = a.parent_id ? categories.find((c) => c.id === a.parent_id) : null;
    const parentB = b.parent_id ? categories.find((c) => c.id === b.parent_id) : null;
    const groupA = parentA ? parentA.name : a.name;
    const groupB = parentB ? parentB.name : b.name;
    if (groupA !== groupB) return groupA.localeCompare(groupB, 'es');
    // Within same group: parent category goes first, then children alphabetically
    const aIsParent = !a.parent_id;
    const bIsParent = !b.parent_id;
    if (aIsParent !== bIsParent) return aIsParent ? -1 : 1;
    return a.name.localeCompare(b.name, 'es');
  });

  return (
    <Autocomplete
      options={sortedCategories}
      value={selected}
      onChange={(_e, option) => onChange(option?.id ?? null)}
      getOptionLabel={(o) => {
        const parent = o.parent_id ? categories.find((c) => c.id === o.parent_id) : null;
        return parent ? `${parent.name} › ${o.name}` : o.name;
      }}
      filterOptions={(options, params) => {
        const filtered = filter(options, params);
        return filtered;
      }}
      groupBy={(o) => {
        const parent = o.parent_id ? categories.find((c) => c.id === o.parent_id) : null;
        return parent ? parent.name : o.name;
      }}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      disableClearable={!allowClear}
      size={size}
      fullWidth={fullWidth}
      renderInput={(params) => <TextField {...params} label={label} />}
      noOptionsText="Sin resultados"
    />
  );
}
