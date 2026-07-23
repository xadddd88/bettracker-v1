import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { geometry, semanticColors } from './theme';

type ScreenHeaderProps = {
  action?: ReactNode;
  eyebrow: string;
  subtitle: string;
  title: string;
};

type ActionCardProps = {
  badge?: string;
  description: string;
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'neutral';
};

type SectionTitleProps = {
  detail?: string;
  title: string;
};

export function ScreenHeader({ action, eyebrow, subtitle, title }: ScreenHeaderProps) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {action}
    </View>
  );
}

export function SectionTitle({ detail, title }: SectionTitleProps) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

export function ActionCard({
  badge,
  description,
  icon,
  label,
  onPress,
  tone = 'neutral',
}: ActionCardProps) {
  const accent = tone === 'accent';
  const tintColor = accent ? semanticColors.onSignal : semanticColors.signal;

  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        accent ? styles.actionCardAccent : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.iconBox, accent ? styles.iconBoxAccent : null]}>
        <SymbolView
          fallback={<Text style={[styles.iconFallback, { color: tintColor }]}>+</Text>}
          name={icon}
          size={23}
          tintColor={tintColor}
        />
      </View>
      <View style={styles.actionCopy}>
        <View style={styles.actionHeading}>
          <Text style={[styles.actionLabel, accent ? styles.actionLabelAccent : null]}>{label}</Text>
          {badge ? (
            <View style={[styles.badge, accent ? styles.badgeAccent : null]}>
              <Text style={[styles.badgeText, accent ? styles.badgeTextAccent : null]}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.actionDescription, accent ? styles.actionDescriptionAccent : null]}>
          {description}
        </Text>
      </View>
      <Text accessibilityElementsHidden style={[styles.chevron, accent ? styles.chevronAccent : null]}>
        ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: semanticColors.textQuietRaised,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    color: semanticColors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    marginTop: 4,
  },
  subtitle: {
    color: semanticColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  sectionTitleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: semanticColors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionDetail: {
    color: semanticColors.textQuiet,
    fontSize: 11,
  },
  actionCard: {
    alignItems: 'center',
    backgroundColor: semanticColors.field,
    borderColor: semanticColors.borderStrong,
    borderCurve: 'continuous',
    borderRadius: geometry.radiusControl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    padding: 14,
  },
  actionCardAccent: {
    backgroundColor: semanticColors.signal,
    borderColor: semanticColors.signal,
  },
  iconBox: {
    alignItems: 'center',
    backgroundColor: semanticColors.fieldRaised,
    borderRadius: geometry.radiusControl,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconBoxAccent: {
    backgroundColor: semanticColors.onSignal,
  },
  iconFallback: {
    fontSize: 20,
    fontWeight: '900',
  },
  actionCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  actionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionLabel: {
    color: semanticColors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  actionLabelAccent: {
    color: semanticColors.onSignal,
  },
  actionDescription: {
    color: semanticColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionDescriptionAccent: {
    color: semanticColors.onSignal,
  },
  badge: {
    backgroundColor: semanticColors.fieldRaised,
    borderRadius: geometry.radiusControl,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeAccent: {
    backgroundColor: semanticColors.onSignal,
  },
  badgeText: {
    color: semanticColors.signal,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  badgeTextAccent: {
    color: semanticColors.onSignal,
  },
  chevron: {
    color: semanticColors.textMuted,
    fontSize: 26,
    lineHeight: 28,
  },
  chevronAccent: {
    color: semanticColors.onSignal,
  },
  pressed: {
    opacity: 0.72,
  },
});
