<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\NotificationResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Notifications\DatabaseNotification;

class NotificationController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $notifications = $request->user()
            ->notifications()
            ->when($request->boolean('unread_only'), fn ($query) => $query->whereNull('read_at'))
            ->latest()
            ->paginate(min($request->integer('per_page', 20), 100));

        return NotificationResource::collection($notifications);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        return response()->json(['count' => $request->user()->unreadNotifications()->count()]);
    }

    public function markRead(Request $request, DatabaseNotification $notification): NotificationResource|JsonResponse
    {
        if ($notification->notifiable_id !== $request->user()->id
            || $notification->notifiable_type !== $request->user()->getMorphClass()) {
            return response()->json([
                'message' => 'Notification not found.',
                'code' => 'not_found',
            ], 404);
        }

        $notification->forceFill(['read_at' => now()])->save();

        return new NotificationResource($notification->refresh());
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $marked = $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return response()->json(['marked' => $marked]);
    }

    public function destroy(Request $request, DatabaseNotification $notification): JsonResponse
    {
        if ($notification->notifiable_id !== $request->user()->id
            || $notification->notifiable_type !== $request->user()->getMorphClass()) {
            return response()->json([
                'message' => 'Notification not found.',
                'code' => 'not_found',
            ], 404);
        }

        $notification->delete();

        return response()->json(['deleted' => true]);
    }

    public function destroyAll(Request $request): JsonResponse
    {
        $deleted = $request->user()->notifications()->delete();

        return response()->json(['deleted' => $deleted]);
    }
}
