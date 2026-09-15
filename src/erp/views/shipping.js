/* Shipping: готовность, самовывоз/доставка и отдельное закрытие заказа.
   IN: сохранённые заказы; OUT: общий экран очереди с действиями выдачи.
   Пока цех не сообщает завершение, Mark ready подтверждают вручную. */
const SHIPPING_TABS=[['awaiting','Awaiting readiness'],['ready','Ready'],['done','Picked up / Delivered']];
let shippingTab='awaiting';
function viewShipping(){return viewOrderQueue(true);}
