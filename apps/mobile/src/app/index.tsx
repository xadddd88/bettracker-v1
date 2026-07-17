import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>BETTRACKER</Text>
      <Text style={styles.title}>xaddd</Text>
      <Text style={styles.subtitle}>Founder development client is ready.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#07111f',
    padding: 24,
  },
  eyebrow: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },
  title: {
    color: '#f8fafc',
    fontSize: 44,
    fontWeight: '800',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
  },
});
