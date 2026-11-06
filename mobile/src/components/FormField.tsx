import { StyleSheet, Text, View } from 'react-native';
import { HelperText, TextInput, type TextInputProps } from 'react-native-paper';
import { palette, spacing } from '@/theme';

export interface FormFieldProps extends Omit<TextInputProps, 'mode' | 'error' | 'label'> {
  label: string;
  error?: string;
  hint?: string;
}

export function FormField({
  label,
  error,
  hint,
  style,
  outlineColor = '#E2E8F0',
  activeOutlineColor = '#059669',
  outlineStyle,
  ...props
}: FormFieldProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        mode="outlined"
        outlineColor={outlineColor}
        activeOutlineColor={activeOutlineColor}
        textColor="#0F172A"
        placeholderTextColor="#94A3B8"
        error={Boolean(error)}
        outlineStyle={[styles.outline, outlineStyle]}
        style={[styles.input, style]}
        {...props}
      />
      {error ? (
        <HelperText type="error" visible padding="none" style={styles.helper}>
          {error}
        </HelperText>
      ) : hint ? (
        <HelperText type="info" visible padding="none" style={styles.helper}>
          {hint}
        </HelperText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 7,
    marginLeft: 2,
    letterSpacing: 0.1,
  },
  input: {
    backgroundColor: '#FFFFFF',
    fontSize: 15,
  },
  outline: {
    borderRadius: 14,
    borderWidth: 1.2,
  },
  helper: {
    marginTop: 4,
    marginLeft: 2,
    fontSize: 12,
  },
});

