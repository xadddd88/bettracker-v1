import { type Href, usePathname, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from './theme';

type NavigationItem = {
  fallback: string;
  href: Href;
  key: 'bets' | 'ai';
  label: string;
  symbol: SymbolViewProps['name'];
};

const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    fallback: 'B',
    href: '/(app)/bets',
    key: 'bets',
    label: 'Bets',
    symbol: { android: 'confirmation_number', ios: 'ticket.fill', web: 'confirmation_number' },
  },
  {
    fallback: 'AI',
    href: '/(app)/ai',
    key: 'ai',
    label: 'AI',
    symbol: { android: 'auto_awesome', ios: 'sparkles', web: 'auto_awesome' },
  },
];

export function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View style={styles.navigation}>
        {NAVIGATION_ITEMS.map((item) => {
          const active = pathname.startsWith(`/${item.key}`);
          const tintColor = active ? colors.accent : colors.muted;

          return (
            <Pressable
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              disabled={active}
              hitSlop={4}
              key={item.key}
              onPress={() => router.replace(item.href)}
              style={({ pressed }) => [
                styles.item,
                active ? styles.itemActive : null,
                pressed ? styles.itemPressed : null,
              ]}
            >
              <SymbolView
                fallback={<Text style={[styles.fallback, { color: tintColor }]}>{item.fallback}</Text>}
                name={item.symbol}
                size={21}
                tintColor={tintColor}
              />
              <Text style={[styles.label, active ? styles.labelActive : null]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopWidth: 1,
  },
  navigation: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  item: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 8,
    flex: 1,
    gap: 2,
    justifyContent: 'center',
    minHeight: 44,
  },
  itemActive: {
    backgroundColor: colors.surfaceRaised,
  },
  itemPressed: {
    opacity: 0.7,
  },
  fallback: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 21,
    textAlign: 'center',
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  labelActive: {
    color: colors.accent,
  },
});
