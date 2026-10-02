from longchatpdf.pdf_export import _linear_partition

def test_linear_partition_keeps_order_and_balance():
    sizes=[4,1,1,4,2,2]
    ranges=_linear_partition(sizes,2)
    assert ranges[0][0] == 0
    assert ranges[-1][1] == len(sizes)
    sums=[sum(sizes[a:b]) for a,b in ranges]
    assert max(sums) <= 8
