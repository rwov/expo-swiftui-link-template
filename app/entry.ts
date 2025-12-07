// Inject a fallback manifest so Expo modules (Linking, router) have a custom scheme in bare runtime
// before the router bootstraps.
import "./expo-constants-fallback";

import "expo-router/entry";
