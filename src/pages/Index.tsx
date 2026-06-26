import { DashboardLayout } from "@/components/DashboardLayout";
import { StatsBar } from "@/components/StatsBar";
import { P1BucketSection } from "@/components/P1BucketSection";
import { AttentionTrackerDashboard } from "@/components/AttentionTrackerDashboard";

const Index = () => {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            P1 ticket triage • Attention tracking • Proactive alerts
          </p>
        </div>
        <StatsBar />
        <P1BucketSection />
        <AttentionTrackerDashboard />
      </div>
    </DashboardLayout>
  );
};

export default Index;
