import { useState, useCallback, useEffect } from "react";

interface EngagementState {
  [ticketKey: string]: {
    commented: boolean;
    commentedAt: Date;
    commentBody: string;
  };
}

export function useTicketEngagement(issueKeys?: string[]) {
  const [engagement, setEngagement] = useState<EngagementState>({});
  const [loading, setLoading] = useState(false);

  // Check Jira for actual comments when component mounts or issueKeys change
  useEffect(() => {
    if (!issueKeys || issueKeys.length === 0) return;

    const checkUserComments = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/jira/check-user-commented", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ issueKeys }),
        });

        if (response.ok) {
          const { results } = await response.json();
          
          // Update engagement state based on actual Jira comments
          const newEngagement: EngagementState = {};
          Object.entries(results).forEach(([key, hasCommented]) => {
            if (hasCommented) {
              newEngagement[key] = {
                commented: true,
                commentedAt: new Date(),
                commentBody: "User has commented on this ticket",
              };
            }
          });
          
          setEngagement(newEngagement);
        }
      } catch (error) {
        console.error("Error checking user comments:", error);
      } finally {
        setLoading(false);
      }
    };

    checkUserComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueKeys?.length]);

  const addComment = useCallback(
    async (issueKey: string, commentBody: string) => {
      try {
        // Call backend to add comment to Jira
        const response = await fetch("/api/jira/api/3/issues/" + issueKey + "/comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: {
              version: 3,
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: commentBody,
                    },
                  ],
                },
              ],
            },
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to add comment");
        }

        // Immediately mark as commented in engagement
        const newEngagement = {
          ...engagement,
          [issueKey]: {
            commented: true,
            commentedAt: new Date(),
            commentBody,
          },
        };

        setEngagement(newEngagement);

        return { success: true };
      } catch (error) {
        console.error("Error adding comment:", error);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    },
    [engagement]
  );

  const markAsAttended = useCallback((issueKey: string, commentBody: string = "") => {
    const newEngagement = {
      ...engagement,
      [issueKey]: {
        commented: true,
        commentedAt: new Date(),
        commentBody,
      },
    };

    setEngagement(newEngagement);
  }, [engagement]);

  const hasEngaged = useCallback((issueKey: string) => {
    return engagement[issueKey]?.commented || false;
  }, [engagement]);

  const getEngagementInfo = useCallback(
    (issueKey: string) => {
      return engagement[issueKey] || null;
    },
    [engagement]
  );

  return {
    engagement,
    addComment,
    markAsAttended,
    hasEngaged,
    getEngagementInfo,
    loading,
  };
}
