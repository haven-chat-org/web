import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useUiStore } from "../store/ui.js";
import { useChatStore } from "../store/chat.js";
import { parseChannelName } from "../lib/channel-utils.js";

export function useOnboarding() {
  const { t } = useTranslation();
  const driverRef = useRef<Driver | null>(null);
  const onboardingCompleted = useUiStore((s) => s.onboardingCompleted);
  const onboardingActive = useUiStore((s) => s.onboardingActive);
  const onboardingRequested = useUiStore((s) => s.onboardingRequested);

  /** Resolve the Haven server, welcome channel, and DM channel from the store. */
  const resolveHavenData = useCallback(() => {
    const servers = useChatStore.getState().servers;
    const havenServer = servers[0] ?? null;
    const channels = useChatStore.getState().channels;
    const welcomeChannel = havenServer
      ? channels.find(
          (c) =>
            c.server_id === havenServer.id &&
            parseChannelName(c.encrypted_meta) === "welcome",
        ) ?? null
      : null;
    const havenDmChannel =
      channels.find((c) => c.channel_type === "dm") ?? null;
    return { havenServer, welcomeChannel, havenDmChannel };
  }, []);

  const buildSteps = useCallback((): DriveStep[] => {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const { havenServer, welcomeChannel, havenDmChannel } = resolveHavenData();

    const steps: DriveStep[] = [
      // Step 0: Welcome modal (no element — renders centered)
      {
        popover: {
          title: t("onboarding.welcome.title"),
          description: t("onboarding.welcome.description"),
          side: "over",
          align: "center",
          popoverClass: "haven-tour haven-tour-welcome",
          showButtons: ["next", "close"],
          nextBtnText: t("onboarding.startTour"),
          showProgress: false,
        },
      },
      // Step 1: Server bar — highlight, mention Haven server
      {
        element: ".server-bar",
        popover: {
          title: t("onboarding.serverBar.title"),
          description: t("onboarding.serverBar.description"),
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
      },
      // Step 2: Channel sidebar — navigate to Haven server first
      {
        element: ".channel-sidebar",
        popover: {
          title: t("onboarding.channelSidebar.title"),
          description: t("onboarding.channelSidebar.description"),
          side: isMobile ? "bottom" : "right",
          align: "start",
        },
        onHighlightStarted: () => {
          // Navigate to the Haven server and select #welcome
          if (havenServer) {
            useUiStore.getState().selectServer(havenServer.id);
            if (welcomeChannel) {
              useChatStore.getState().selectChannel(welcomeChannel.id);
            }
          }
        },
      },
      // Step 3: Message input
      {
        element: ".message-input-wrapper",
        popover: {
          title: t("onboarding.messageInput.title"),
          description: t("onboarding.messageInput.description"),
          side: "top",
          align: "center",
        },
      },
      // Step 4: Header tools (search, pins, attachments, reactions)
      {
        element: ".chat-header-right",
        popover: {
          title: t("onboarding.headerTools.title"),
          description: t("onboarding.headerTools.description"),
          side: "bottom",
          align: "end",
        },
      },
    ];

    // Step 5: Member sidebar (skipped on mobile)
    if (!isMobile) {
      steps.push({
        element: () => {
          const sidebar = document.querySelector(".member-sidebar");
          if (sidebar) return sidebar as Element;
          const btn = document.querySelector(
            '[aria-label="Toggle member sidebar"]',
          ) as Element | null;
          return (
            btn ||
            (document.querySelector(".chat-header-right") as Element) ||
            document.body
          );
        },
        popover: {
          title: t("onboarding.memberSidebar.title"),
          description: t("onboarding.memberSidebar.description"),
          side: "left",
          align: "start",
        },
        onHighlightStarted: () => {
          const ui = useUiStore.getState();
          if (!ui.memberSidebarOpen) {
            ui.toggleMemberSidebar();
          }
        },
      });
    }

    // Step 6: Home button — navigate to Home/DMs view
    steps.push({
      element: ".home-icon",
      popover: {
        title: t("onboarding.homeButton.title"),
        description: t("onboarding.homeButton.description"),
        side: isMobile ? "bottom" : "right",
        align: "start",
      },
      onHighlightStarted: () => {
        // Use setTimeout so driver.js finishes its DOM work first
        setTimeout(() => {
          useUiStore.getState().selectServer(null);
        }, 0);
      },
    });

    // Step 7: Channel sidebar (now showing Friends & DMs)
    steps.push({
      element: ".channel-sidebar",
      popover: {
        title: t("onboarding.friendsDms.title"),
        description: t("onboarding.friendsDms.description"),
        side: isMobile ? "bottom" : "right",
        align: "start",
      },
      onHighlightStarted: () => {
        // Ensure we're on the Home/DMs view
        useUiStore.getState().selectServer(null);
        useUiStore.getState().setShowFriends(true);
      },
    });

    // Step 8: Open the Haven DM — show the user what a DM looks like
    if (havenDmChannel) {
      steps.push({
        element: ".message-list",
        popover: {
          title: t("onboarding.havenDm.title"),
          description: t("onboarding.havenDm.description"),
          side: "top",
          align: "center",
        },
        onHighlightStarted: () => {
          useUiStore.getState().selectServer(null);
          useUiStore.getState().setShowFriends(false);
          if (havenDmChannel) {
            useChatStore.getState().selectChannel(havenDmChannel.id);
          }
        },
      });
    }

    // Step 9: User panel
    steps.push({
      element: ".user-panel",
      popover: {
        title: t("onboarding.userPanel.title"),
        description: t("onboarding.userPanel.description"),
        side: "top",
        align: "center",
      },
    });

    // Step 10: E2EE explainer (centered modal)
    steps.push({
      popover: {
        title: t("onboarding.encryption.title"),
        description: t("onboarding.encryption.description"),
        side: "over",
        align: "center",
        popoverClass: "haven-tour haven-tour-encryption",
        showProgress: true,
      },
    });

    return steps;
  }, [t, resolveHavenData]);

  const startTour = useCallback(
    (force = false) => {
      if (onboardingActive) return;
      if (!force && onboardingCompleted) return;

      // Navigate to the Haven server BEFORE starting the tour so channels are
      // visible behind the welcome overlay instead of "No channels yet".
      const { havenServer, welcomeChannel } = resolveHavenData();
      if (havenServer) {
        useUiStore.getState().selectServer(havenServer.id);
        if (welcomeChannel) {
          useChatStore.getState().selectChannel(welcomeChannel.id);
        }
      }

      const steps = buildSteps();
      const reducedMotion = useUiStore.getState().a11yReducedMotion;

      const driverObj = driver({
        showProgress: true,
        progressText: t("onboarding.progress"),
        animate: !reducedMotion,
        overlayColor: "rgba(0, 0, 0, 0.75)",
        stagePadding: 8,
        stageRadius: 8,
        allowClose: true,
        allowKeyboardControl: true,
        smoothScroll: !reducedMotion,
        popoverClass: "haven-tour",
        popoverOffset: 12,
        showButtons: ["next", "previous", "close"],
        nextBtnText: t("onboarding.next"),
        prevBtnText: t("onboarding.previous"),
        doneBtnText: t("onboarding.done"),
        steps,
        onPopoverRender: (popover) => {
          popover.wrapper.setAttribute("role", "dialog");
          popover.wrapper.setAttribute("aria-modal", "true");
          popover.wrapper.setAttribute(
            "aria-label",
            t("onboarding.tourAriaLabel"),
          );
        },
        onDestroyStarted: () => {
          driverObj.destroy();
        },
        onDestroyed: () => {
          useUiStore.getState().setOnboardingCompleted(true);
          useUiStore.getState().setOnboardingActive(false);
          driverRef.current = null;

          // After tour ends, land the user on the Haven server's welcome channel
          const data = resolveHavenData();
          if (data.havenServer) {
            useUiStore.getState().selectServer(data.havenServer.id);
            if (data.welcomeChannel) {
              useChatStore.getState().selectChannel(data.welcomeChannel.id);
            }
          }
        },
      });

      driverRef.current = driverObj;
      useUiStore.getState().setOnboardingActive(true);
      driverObj.drive();
    },
    [onboardingActive, onboardingCompleted, buildSteps, resolveHavenData, t],
  );

  // Watch for re-trigger requests (from CommandPalette or UserSettings)
  useEffect(() => {
    if (onboardingRequested && !onboardingActive) {
      useUiStore.getState().clearOnboardingRequest();
      // Small delay to let any modals close first
      const timer = setTimeout(() => startTour(true), 300);
      return () => clearTimeout(timer);
    }
  }, [onboardingRequested, onboardingActive, startTour]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driverRef.current?.isActive()) {
        driverRef.current.destroy();
      }
    };
  }, []);

  return { startTour, isActive: onboardingActive };
}
