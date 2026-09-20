/**
 * Pick research interests: tap suggestions, or type a custom one.
 *
 * Selection is held as an ordered list of display names (not IDs) because the
 * backend's PUT accepts names and creates unknown ones on the fly — one code
 * path for suggested and custom alike.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/TextField';
import { FALLBACK_SUGGESTED_INTERESTS } from '@/constants/interests';
import { spacing, typography } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { customInterestSchema } from '@/services/validation';
import { Button } from './Button';

export const MAX_INTERESTS = 25;

interface InterestPickerProps {
  suggestions: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function sameInterest(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function InterestPicker({ suggestions, selected, onChange }: InterestPickerProps) {
  const { colors } = useTheme();
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | undefined>();

  const availableSuggestions = useMemo(
    () => (suggestions.length > 0 ? suggestions : [...FALLBACK_SUGGESTED_INTERESTS]),
    [suggestions],
  );

  // Custom interests are the ones not present in the suggestion list.
  const customSelections = useMemo(
    () =>
      selected.filter((name) => !availableSuggestions.some((s) => sameInterest(s, name))),
    [selected, availableSuggestions],
  );

  const toggle = (name: string) => {
    const isSelected = selected.some((s) => sameInterest(s, name));
    if (isSelected) {
      onChange(selected.filter((s) => !sameInterest(s, name)));
    } else if (selected.length < MAX_INTERESTS) {
      onChange([...selected, name]);
    }
  };

  const addCustom = () => {
    const parsed = customInterestSchema.safeParse(customValue);
    if (!parsed.success) {
      setCustomError(parsed.error.issues[0]?.message ?? 'Enter a valid interest.');
      return;
    }

    const name = parsed.data;
    if (selected.some((s) => sameInterest(s, name))) {
      setCustomError('You have already added that.');
      return;
    }
    if (selected.length >= MAX_INTERESTS) {
      setCustomError(`You can select up to ${MAX_INTERESTS} interests.`);
      return;
    }

    onChange([...selected, name]);
    setCustomValue('');
    setCustomError(undefined);
  };

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Suggested topics
        </Text>
        <View style={styles.chipGrid} testID="suggested-interests">
          {availableSuggestions.map((name) => (
            <Chip
              key={name}
              testID={`interest-${name}`}
              label={name}
              selected={selected.some((s) => sameInterest(s, name))}
              onPress={() => toggle(name)}
            />
          ))}
        </View>
      </View>

      {customSelections.length > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Your own topics
          </Text>
          <View style={styles.chipGrid}>
            {customSelections.map((name) => (
              <Chip
                key={name}
                label={name}
                selected
                onRemove={() => toggle(name)}
                testID={`custom-interest-${name}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Add your own</Text>
        <TextField
          testID="custom-interest-input"
          label="Research topic"
          value={customValue}
          onChangeText={(value) => {
            setCustomValue(value);
            if (customError) setCustomError(undefined);
          }}
          placeholder="e.g. Neurosymbolic reasoning"
          autoCapitalize="words"
          error={customError}
          returnKeyType="done"
          onSubmitEditing={addCustom}
        />
        <Button
          testID="add-interest-button"
          label="Add topic"
          variant="secondary"
          onPress={addCustom}
          disabled={customValue.trim().length === 0}
        />
      </View>

      <Text style={[styles.counter, { color: colors.textMuted }]}>
        {selected.length} of {MAX_INTERESTS} selected
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.xl, paddingBottom: spacing.xl },
  section: { gap: spacing.md },
  sectionTitle: { ...typography.heading },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  counter: { ...typography.caption, textAlign: 'center' },
});
