import { Redirect } from 'expo-router';

/** Entry point — NavigationGate in the root layout does the real routing. */
export default function Index() {
  return <Redirect href="/(tabs)/discover" />;
}
