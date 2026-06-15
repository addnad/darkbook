module darkbook::vault {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::event;

    const ENotOwner: u64 = 1;
    const EInsufficientBalance: u64 = 2;
    const EAlreadyMatched: u64 = 3;
    const ESelfMatch: u64 = 4;

    public struct Vault has key {
        id: UID,
        balances: Table<address, u64>,
        matcher: address,
    }

    public struct Intent has key {
        id: UID,
        owner: address,
        side: u8,
        amount: u64,
        min_price: u64,
        matched: bool,
        expires_at: u64,
    }

    public struct Deposited has copy, drop {
        user: address,
        amount: u64,
        intent_id: ID,
    }

    public struct Settled has copy, drop {
        buyer: address,
        seller: address,
        amount: u64,
        price: u64,
    }

    public struct Cancelled has copy, drop {
        user: address,
        amount: u64,
    }

    fun init(ctx: &mut TxContext) {
        let vault = Vault {
            id: object::new(ctx),
            balances: table::new(ctx),
            matcher: tx_context::sender(ctx),
        };
        transfer::share_object(vault);
    }

    entry fun deposit_and_intent(
        vault: &mut Vault,
        coin: Coin<SUI>,
        side: u8,
        min_price: u64,
        expires_at: u64,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&coin);
        let sender = tx_context::sender(ctx);

        if (table::contains(&vault.balances, sender)) {
            let bal = table::borrow_mut(&mut vault.balances, sender);
            *bal = *bal + amount;
        } else {
            table::add(&mut vault.balances, sender, amount);
        };

        sui::dynamic_field::add(&mut vault.id, sender, coin);

        let intent = Intent {
            id: object::new(ctx),
            owner: sender,
            side,
            amount,
            min_price,
            matched: false,
            expires_at,
        };

        let intent_id = object::id(&intent);

        event::emit(Deposited { user: sender, amount, intent_id });

        transfer::share_object(intent);
    }

    entry fun settle(
        vault: &mut Vault,
        intent_a: &mut Intent,
        intent_b: &mut Intent,
        agreed_price: u64,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == vault.matcher, ENotOwner);
        assert!(intent_a.owner != intent_b.owner, ESelfMatch);
        assert!(!intent_a.matched && !intent_b.matched, EAlreadyMatched);

        let (buyer, seller, amount) = if (intent_a.side == 0) {
            (intent_a.owner, intent_b.owner, intent_a.amount)
        } else {
            (intent_b.owner, intent_a.owner, intent_b.amount)
        };

        assert!(*table::borrow(&vault.balances, buyer) >= amount, EInsufficientBalance);
        assert!(*table::borrow(&vault.balances, seller) >= amount, EInsufficientBalance);

        let buyer_bal = table::borrow_mut(&mut vault.balances, buyer);
        *buyer_bal = *buyer_bal - amount;
        let seller_bal = table::borrow_mut(&mut vault.balances, seller);
        *seller_bal = *seller_bal + amount;

        intent_a.matched = true;
        intent_b.matched = true;

        event::emit(Settled { buyer, seller, amount, price: agreed_price });
    }

    entry fun cancel(
        vault: &mut Vault,
        intent: &mut Intent,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(intent.owner == sender, ENotOwner);
        assert!(!intent.matched, EAlreadyMatched);

        intent.matched = true;

        let bal = table::borrow_mut(&mut vault.balances, sender);
        *bal = 0;

        let coin: Coin<SUI> = sui::dynamic_field::remove(&mut vault.id, sender);
        transfer::public_transfer(coin, sender);

        event::emit(Cancelled { user: sender, amount: intent.amount });
    }

    public fun balance_of(vault: &Vault, addr: address): u64 {
        if (table::contains(&vault.balances, addr)) {
            *table::borrow(&vault.balances, addr)
        } else {
            0
        }
    }
}
