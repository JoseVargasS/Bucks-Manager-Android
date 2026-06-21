import { useLayoutEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

export function useModalTransition(visible: boolean, offset = 16, scaleFrom = 1) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useLayoutEffect(() => {
    progress.stopAnimation();
    if (visible) setMounted(true);
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 160 : 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [progress, visible]);

  return {
    modalVisible: visible || mounted,
    containerStyle: { opacity: progress },
    panelStyle: {
      transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) },
      ],
    },
    dismissImmediately() {
      progress.stopAnimation();
      progress.setValue(0);
      setMounted(false);
    },
  };
}
