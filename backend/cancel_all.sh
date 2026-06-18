#!/bin/bash

PACKAGE="0x2276038051933e0e4024bc253d1b646982afb60162b79de666d080a7fd000de3"
VAULT="0x84e7da902cf30f0946a320a17dee1b52d39bb040ef03822aab2084ab41f2eaba"

cancel() {
  local alias=$1
  local intent_id=$2
  echo "--- Cancelling intent $intent_id on $alias ---"
  sui client switch --address "$alias"
  sui client call \
    --package "$PACKAGE" \
    --module vault \
    --function cancel \
    --args "$VAULT" "$intent_id" \
    --gas-budget 20000000 || echo "FAILED: $intent_id (may already be settled/cancelled)"
  echo ""
}

# elegant-prase
cancel elegant-prase 0x4e344085b398b8fac964094fa750a2dc2c76b760a2bb3fe4b1e03859e6169593
cancel elegant-prase 0x4f8ed919924dd8109e6b72c98879814a7642c6b6865ad4fc7d754b2b1bab040f
cancel elegant-prase 0x86e2f1c9a5e6600a62f8083e0e2c5d8eed2368923d54b3514346ff5b31d4895d

# nostalgic-sphene
cancel nostalgic-sphene 0xd7a42df607ffc38487f7563512c54a9ef044fbaf95c658147cc858128c1c9d2d
cancel nostalgic-sphene 0x4a3cf8ac1641026a31114caa0818fbb6c98eb210b0f09f8613ac74b7a4e81149

# determined-topaz
cancel determined-topaz 0xd68f5ffd8d27e7ff82399c0f4753ae188236a1c8043dd413dfcde8aa177086d7
cancel determined-topaz 0xb389e305dde2d510ea31f05df55cc4296404e935ca5ecdc914f23cbb2868c4d4
cancel determined-topaz 0xe6008f23b32f0d7ce218aa1558d1e0e2dcbd76b32e191b0ab2903a013e0f2bee
cancel determined-topaz 0x28f7a9e4312936be27192f6200d163562392c93905a1f97ae59de083968df3ab
cancel determined-topaz 0x39deb76e7c19dd348bade9c4cceb22c687e648fc99dc1a4969bcf599104bd203
cancel determined-topaz 0xeab310d5c726ffcdcfbf8a4415ebe4c1338181579d0acacc5527b1a54d59a6b7
cancel determined-topaz 0x82b659cddc11459ab9beeefff20ef0747f84f6cfedb80f227a6f58cf0fceea18
cancel determined-topaz 0x4ea721ef63466634f0cb83f321332384e323c3009eebcb9bf5977bce3b0fc6de
cancel determined-topaz 0xff796b5bc7286e51cf765483295cc171a54e8039cd8d17ead322bfdcc40fdee2
cancel determined-topaz 0xeb3b61ca455dd3e139a8eb3a7f2c397080f043a17c8f3a852d8c5a4ffde1264c

# suspicious-epidote
cancel suspicious-epidote 0xcbe7cd4a8629e0dbf1607ea19633344d7b7ea1fd96cf418cf35ab13599771b41

# tender-spinel
cancel tender-spinel 0x0a5f959bd6c63373673b766474dd12fc0d9dfdeb339ad566d16e3af3e507dbdb

echo "=== Cancellation pass complete ==="
