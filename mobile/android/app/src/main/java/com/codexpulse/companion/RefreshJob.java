package com.codexpulse.companion;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class RefreshJob extends JobService {
    static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean REFRESHING = new AtomicBoolean();
    static void refresh(Context context, Runnable completed) {
        if (!REFRESHING.compareAndSet(false, true)) { completed.run(); return; }
        EXECUTOR.execute(() -> { try { if (new PhoneStore(context).read().has("connection")) new CompanionClient(context).refresh(); } catch (Exception ignored) { } finally { REFRESHING.set(false); PulseWidget.updateAll(context); completed.run(); } });
    }
    static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        JobInfo job = new JobInfo.Builder(47831, new ComponentName(context, RefreshJob.class)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15 * 60 * 1000L).setPersisted(true).build();
        JobInfo prior = scheduler.getPendingJob(47831);
        if (prior == null || !prior.isPersisted()) scheduler.schedule(job);
    }
    @Override public boolean onStartJob(JobParameters params) {
        refresh(this, () -> jobFinished(params, false));
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) { return true; }
}
