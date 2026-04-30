/**
 * 01_Schema.gs
 * Definisi sheet dan header database.
 */
const DB_SCHEMA = {
  Settings: [
    'key', 'value', 'description', 'updated_at', 'updated_by'
  ],
  Users: [
    'user_id', 'name', 'phone', 'password_hash', 'role', 'operator_id', 'active',
    'created_at', 'updated_at', 'last_login'
  ],
  Sessions: [
    'session_id', 'user_id', 'token', 'created_at', 'expires_at', 'active', 'last_seen_at', 'user_agent'
  ],
  Operators: [
    'operator_id', 'user_id', 'operator_name', 'phone', 'active', 'chair_no',
    'daily_capacity', 'work_start', 'work_end', 'commission_type', 'commission_value',
    'notes', 'created_at', 'updated_at'
  ],
  Services: [
    'service_id', 'service_name', 'duration_min', 'price', 'active',
    'description', 'created_at', 'updated_at'
  ],
  Bookings: [
    'booking_id', 'booking_date', 'queue_no', 'customer_id', 'customer_name', 'customer_phone',
    'service_id', 'service_name', 'operator_id', 'operator_name', 'chair_no', 'slot_time',
    'estimated_duration_min', 'status', 'price', 'payment_status', 'called_at', 'started_at',
    'finished_at', 'actual_duration_min', 'cancelled_at', 'cancel_reason', 'no_show_at',
    'created_at', 'updated_at', 'created_by'
  ],
  Payments: [
    'payment_id', 'booking_id', 'payment_date', 'amount', 'method', 'status',
    'gateway', 'gateway_reference', 'merchant_ref', 'payment_channel', 'checkout_url',
    'instructions', 'raw_payload', 'callback_payload', 'notes', 'created_at', 'created_by', 'updated_at'
  ],
  DailyCapacity: [
    'date', 'operator_id', 'operator_name', 'chair_no', 'capacity', 'active',
    'notes', 'updated_at', 'updated_by'
  ],
  Holidays: [
    'date', 'holiday_name', 'active', 'notes', 'created_at', 'created_by'
  ],
  OperationalInfo: [
    'info_id', 'title', 'message', 'active', 'date_from', 'date_to', 'priority',
    'created_at', 'created_by', 'updated_at', 'updated_by'
  ],
  Notifications: [
    'notification_id', 'user_id', 'booking_id', 'title', 'message', 'type',
    'read_status', 'created_at', 'read_at'
  ],
  AuditLogs: [
    'log_id', 'timestamp', 'user_id', 'role', 'action', 'entity', 'entity_id',
    'old_value', 'new_value', 'notes'
  ],
  PaymentCallbacks: [
    'callback_id', 'gateway', 'reference', 'merchant_ref', 'status', 'raw_payload', 'created_at', 'processed'
  ]
};
